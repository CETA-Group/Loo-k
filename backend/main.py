from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import math
from backend.solana_service import write_score_to_solana

# ── Backboard imports (optional — server starts fine without backboard) ──
try:
    from backboard_services.preferences import save_preferences, get_preferences
    from backboard_services.user_history import add_history, get_history
    from backboard_services.previous_searches import save_search, get_searches
    from backboard_services.previous_outcomes import log_outcome, get_outcomes
    from backboard_services.states import set_state, get_state
    from backboard_services.recommendation_service import recommend_housing
    BACKBOARD_AVAILABLE = True
except Exception:
    BACKBOARD_AVAILABLE = False

from backend.auth0_service import verify_jwt
from backend.gemini import generate_recommendation
from backend.prompt_builder import build_prompt

app = FastAPI()

# Allow the frontend (http://localhost:8080) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / response models ─────────────────────────────────────────────

class Item(BaseModel):
    name: str
    value: int

class HousingRecommendationRequest(BaseModel):
    user_id: str
    map_data: dict
    is_logged_in: bool = True

class CostAnalysisRequest(BaseModel):
    lat: float
    lng: float
    address: str = "Selected location"
    user_preferences: dict = {}


# ── Helpers ───────────────────────────────────────────────────────────────

def _mock_ai_analysis(address: str, costs: dict) -> dict:
    """Deterministic AI-style analysis when Gemini is unavailable."""
    total = costs["total"]
    rent_pct = round(costs["rent"] / total * 100)

    # Score each factor 0-10 (lower cost = higher score)
    def score(val, max_val):
        return round(10 * (1 - min(val, max_val) / max_val), 1)

    factor_scores = {
        "rent_cost":          score(costs["rent"],          2200),
        "commute":            score(costs["commute"],        500),
        "healthcare_access":  7.2,
        "parks_recreation":   6.8,
        "noise_pollution":    6.5,
        "groceries_food_cost": score(costs["groceries"],    650),
    }
    livability = round(sum(factor_scores.values()) / len(factor_scores) * 10)
    suitability = min(100, livability + 5)

    strengths, weaknesses = [], []
    if costs["rent"]      < 1400: strengths.append("Below-average rent keeps housing costs manageable")
    else:                          weaknesses.append("Rent is above the regional median")
    if costs["commute"]   < 200:  strengths.append("Low commute cost suggests good proximity to work")
    else:                          weaknesses.append("Higher commute costs reduce disposable income")
    if costs["groceries"] < 400:  strengths.append("Grocery spending is within a healthy budget range")
    else:                          weaknesses.append("Grocery costs are above average for this area")
    if not strengths: strengths.append("Overall cost profile is comparable to the regional average")
    if not weaknesses: weaknesses.append("No major cost concerns identified")

    return {
        "summary": {
            "best_option_id":    "target_location",
            "best_option_label": address,
            "livability_score":  livability,
            "suitability_score": suitability,
            "confidence":        72,
            "why_this_wins": (
                f"With {rent_pct}% of monthly expenses going to rent and an estimated total of "
                f"${total:,}/month, this location offers a balanced cost profile for the Waterloo-KW region."
            ),
        },
        "ranked_options": [{
            "option_id":         "target_location",
            "option_label":      address,
            "rank":              1,
            "livability_score":  livability,
            "suitability_score": suitability,
            "factor_scores":     factor_scores,
            "strengths":         strengths,
            "weaknesses":        weaknesses,
            "tradeoffs": (
                f"Rent accounts for {rent_pct}% of the total budget. "
                "Commute and grocery costs are the next largest factors to consider."
            ),
            "matched_preferences":     ["budget_conscious", "urban_living"],
            "history_signals_used":    [],
            "reason": (
                f"Estimated true monthly cost of ${total:,} reflects rent, commute, groceries, "
                "utilities, entertainment, and transport for this location."
            ),
        }],
        "explainability": {
            "used_logged_in_personalization": False,
            "preferences_used":          [],
            "history_used":              [],
            "hard_constraints_applied":  [],
            "soft_preferences_applied":  [],
            "missing_data_notes":        ["AI inference unavailable — analysis based on cost model only"],
            "scoring_notes": (
                "Scores derived from estimated monthly cost breakdown. "
                "Connect a valid Gemini API key for full AI-powered analysis."
            ),
        },
        "_demo_mode": True,
    }



def _mock_costs(lat: float, lng: float, prefs: dict = None) -> dict:
    """
    Deterministic base costs from coordinates, then adjusted by user preferences.

    Preference fields used:
      salary         – annual income (affects housing budget tier)
      workSchedule   – remote/hybrid/in-office (multiplies commute days)
      transport      – car/public_transit/bike/walking (base commute cost)
      carOwnership   – yes/no (adds car fixed costs to transport)
      fuelType       – gas/electric (affects per-km fuel cost)
      monthlyParking – yes/no (adds flat parking cost)
      housingType    – studio/1bed/2bed/shared/house (rent multiplier)
      householdSize  – 1/2/3/4+ (scales utilities & groceries)
      shopping       – budget/average/premium (grocery multiplier)
      eating         – rarely/occasionally/frequently (adds dining-out cost)
      recreation     – low/medium/high (entertainment multiplier)
    """
    if prefs is None:
        prefs = {}

    seed_val = abs(math.sin(lat * 127.1 + lng * 311.7)) * 1e6

    def rand(min_v: int, max_v: int) -> int:
        nonlocal seed_val
        seed_val = (seed_val * 9301 + 49297) % 233280
        return round(min_v + (seed_val / 233280) * (max_v - min_v))

    # ── Base location costs ──────────────────────────────────────────────────
    base_rent          = rand(900,  2200)
    base_commute       = rand(80,   350)   # base = transit-like cost
    base_groceries     = rand(280,  580)
    base_utilities     = rand(90,   220)
    base_entertainment = rand(60,   250)
    base_transport     = rand(50,   160)

    # ── RENT: adjusted by housing type preference ────────────────────────────
    housing_mult = {
        "studio":    0.78,
        "shared":    0.65,
        "1bed":      1.0,   # default
        "2bed":      1.35,
        "house":     1.60,
    }
    ht = str(prefs.get("housingType", "")).lower().replace(" ", "").replace("-", "")
    ht_key = "1bed"
    if "studio" in ht:   ht_key = "studio"
    elif "shared" in ht: ht_key = "shared"
    elif "2bed" in ht or "2bedroom" in ht: ht_key = "2bed"
    elif "house" in ht:  ht_key = "house"
    rent = round(base_rent * housing_mult[ht_key])

    # ── COMMUTE: transport mode × work schedule × parking ───────────────────
    transport_mode = str(prefs.get("transport", "")).lower()
    schedule       = str(prefs.get("workSchedule", "")).lower()
    car_owned      = str(prefs.get("carOwnership", "")).lower() == "yes"
    fuel_type      = str(prefs.get("fuelType", "")).lower()
    has_parking    = str(prefs.get("monthlyParking", "")).lower() == "yes"

    # Days per month in office
    days_per_month = {"remote": 0, "hybrid": 8, "in-office": 22, "in_office": 22}.get(
        schedule.replace(" ", "_").replace("(", "").replace(")", "").split("_")[0], 10
    )
    if "remote" in schedule:    days_per_month = 0
    elif "hybrid" in schedule:  days_per_month = 8
    elif "office" in schedule:  days_per_month = 22

    # Per-trip commute cost based on transport mode
    if "car" in transport_mode:
        per_trip = 8 if "electric" in fuel_type else 12
    elif "transit" in transport_mode or "public" in transport_mode:
        per_trip = 6
    elif "bike" in transport_mode:
        per_trip = 1
    else:  # walking
        per_trip = 0

    commute = round(per_trip * days_per_month * 2)  # round-trip
    commute = max(commute, base_commute // 3 if days_per_month == 0 else base_commute // 2)

    # Parking surcharge
    if has_parking:
        commute += 150

    # Car ownership fixed costs (insurance + maintenance amortised)
    if car_owned:
        base_transport += 180  # ~$180/mo fixed car costs beyond commute

    transport = base_transport

    # ── GROCERIES: shopping preference × household size ──────────────────────
    shopping_mult = {"budget": 0.78, "average": 1.0, "premium": 1.35}
    shop_key = "average"
    shop_raw = str(prefs.get("shopping", "")).lower()
    if "budget" in shop_raw:   shop_key = "budget"
    elif "premium" in shop_raw or "organic" in shop_raw: shop_key = "premium"

    household_size = str(prefs.get("householdSize", "1")).replace("+", "").strip()
    try:
        hh = int(household_size[0])
    except (ValueError, IndexError):
        hh = 1
    hh = min(hh, 4)

    groceries = round(base_groceries * shopping_mult[shop_key] * (0.7 + 0.3 * hh))

    # ── UTILITIES: scales mildly with household size ──────────────────────────
    utilities = round(base_utilities * (0.85 + 0.15 * hh))

    # ── ENTERTAINMENT: recreation level + eating out ──────────────────────────
    rec_mult = {"low": 0.55, "medium": 1.0, "high": 1.6}
    rec_raw = str(prefs.get("recreation", "")).lower()
    rec_key = "medium"
    if "low" in rec_raw:   rec_key = "low"
    elif "high" in rec_raw: rec_key = "high"

    eating_add = {"rarely": 0, "occasionally": 120, "frequently": 280}
    eat_raw = str(prefs.get("eating", "")).lower()
    eat_key = "occasionally"
    if "rarely" in eat_raw:       eat_key = "rarely"
    elif "frequently" in eat_raw: eat_key = "frequently"

    entertainment = round(base_entertainment * rec_mult[rec_key]) + eating_add[eat_key]

    total = rent + commute + groceries + utilities + entertainment + transport
    return {
        "rent": rent,
        "commute": commute,
        "groceries": groceries,
        "utilities": utilities,
        "entertainment": entertainment,
        "transport": transport,
        "total": total,
    }


# ── Existing endpoints ────────────────────────────────────────────────────

@app.post("/items")
def create_item(item: Item):
    return {"message": f"Received {item.name} with value {item.value}"}

@app.get("/protected")
def protected_route(user=Depends(verify_jwt)):
    return {"message": "OK", "user": user}

# Backboard-backed endpoints (only active when backboard is installed)
if BACKBOARD_AVAILABLE:
    @app.post("/preferences")
    async def update_prefs(user_id: str, prefs: dict):
        await save_preferences(user_id, prefs)
        return {"status": "ok"}

    @app.get("/preferences/{user_id}")
    async def get_user_prefs(user_id: str):
        return await get_preferences(user_id)

    @app.post("/history")
    async def add_user_history(user_id: str, event: dict):
        await add_history(user_id, event)
        return {"status": "ok"}

    @app.get("/history/{user_id}")
    async def get_user_history(user_id: str):
        return await get_history(user_id)

    @app.post("/search")
    async def save_user_search(user_id: str, query: str):
        await save_search(user_id, query)
        return {"status": "ok"}

    @app.get("/searches/{user_id}")
    async def get_user_searches(user_id: str):
        return await get_searches(user_id)

    @app.post("/outcome")
    async def log_user_outcome(user_id: str, outcome: dict):
        await log_outcome(user_id, outcome)
        return {"status": "ok"}

    @app.get("/outcomes/{user_id}")
    async def get_user_outcomes(user_id: str):
        return await get_outcomes(user_id)

    @app.post("/state")
    async def set_user_state(user_id: str, state: dict):
        await set_state(user_id, state)
        return {"status": "ok"}

    @app.get("/state/{user_id}")
    async def get_user_state(user_id: str):
        return await get_state(user_id)

    @app.post("/recommend-housing")
    async def get_housing_recommendation(request: HousingRecommendationRequest):
        result = await recommend_housing(
            user_id=request.user_id,
            map_data=request.map_data,
            is_logged_in=request.is_logged_in
        )
        return result


# ── NEW: Address cost analysis (no Backboard required) ────────────────────

def _cost_ranges(base: int, low_pct: float = 0.88, high_pct: float = 1.12) -> dict:
    """Generate lowest/average/highest range from a base estimate."""
    return {
        "lowest":  round(base * low_pct),
        "average": base,
        "highest": round(base * high_pct),
    }

def _generate_insights(costs: dict, prefs: dict) -> list:
    """Generate personalised insight bullets based on costs + user preferences."""
    insights = []
    total = costs["total"] or 1

    # Largest cost driver
    cats = {k: v for k, v in costs.items() if k != "total"}
    top = max(cats, key=cats.get)
    insights.append(f"{top.capitalize()} is your largest monthly cost at ${costs[top]:,} ({round(costs[top]/total*100)}% of total)")

    # Commute insight
    schedule = str(prefs.get("workSchedule", "")).lower()
    transport = str(prefs.get("transport", "")).lower()
    if "remote" in schedule:
        insights.append("You work remotely — commute cost is minimal for this location")
    elif "office" in schedule and costs["commute"] > 200:
        insights.append(f"In-office schedule by {transport} adds ${costs['commute']:,}/mo — consider proximity to work when comparing locations")
    elif costs["commute"] < 100:
        insights.append("Commute cost is low — this location works well with your transport mode")

    # Shopping / groceries insight
    shopping = str(prefs.get("shopping", "")).lower()
    if "premium" in shopping and costs["groceries"] > 450:
        insights.append(f"Premium grocery preferences contribute ${costs['groceries']:,}/mo — budget-conscious areas may reduce this")
    elif "budget" in shopping:
        insights.append(f"Budget shopping keeps groceries at ${costs['groceries']:,}/mo — look for discount stores nearby")

    # Entertainment variability
    insights.append("Entertainment and dining-out costs have the widest variability — actual spend depends on lifestyle choices")

    return insights[:4]  # cap at 4


@app.post("/api/cost-analysis")
async def api_cost_analysis(request: CostAnalysisRequest):
    prefs = request.user_preferences or {}
    costs = _mock_costs(request.lat, request.lng, prefs)

    # ── Build human-readable preference summary for Gemini ──────────────────
    has_prefs = bool(prefs)
    work_addr    = prefs.get("workAddress", "")
    schedule     = prefs.get("workSchedule", "unknown")
    transport    = prefs.get("transport", "unknown")
    car_owned    = prefs.get("carOwnership", "unknown")
    fuel         = prefs.get("fuelType") or "N/A"
    parking      = prefs.get("monthlyParking", "unknown")
    housing_type = prefs.get("housingType", "unknown")
    hh_size      = prefs.get("householdSize", "unknown")
    shopping     = prefs.get("shopping", "unknown")
    eating       = prefs.get("eating", "unknown")
    recreation   = prefs.get("recreation", "unknown")
    salary       = prefs.get("salary", "unknown")
    hobbies      = ", ".join(prefs.get("hobbies", [])) or "none specified"

    prefs_section = f"""
USER PROFILE (personalise scores based on this):
- Name: {prefs.get("displayName", "Anonymous")}
- Annual salary: ${salary}
- Work address: {work_addr if work_addr else "not provided"}
- Work schedule: {schedule}
- Primary transport: {transport}
- Car ownership: {car_owned} (fuel: {fuel}, monthly parking: {parking})
- Housing preference: {housing_type}, household size: {hh_size}
- Shopping habits: {shopping}
- Eating out: {eating}
- Recreation level: {recreation}
- Hobbies: {hobbies}
""" if has_prefs else "USER NOT LOGGED IN — use general population averages."

    prompt = f"""You are a personalised housing livability analyst. Analyse this address for this specific user and return ONLY valid JSON, no markdown, no prose.

Address: {request.address}
Coordinates: lat={request.lat}, lng={request.lng}
{prefs_section}
Monthly cost estimates (already adjusted for user preferences):
- Rent: ${costs['rent']} (adjusted for housing type: {housing_type})
- Commute: ${costs['commute']} (based on {transport}, {schedule}, work address: {work_addr or 'unknown'})
- Groceries: ${costs['groceries']} (based on {shopping} shopping, {hh_size} household)
- Utilities: ${costs['utilities']}
- Entertainment: ${costs['entertainment']} (based on {recreation} recreation, eating out {eating})
- Transport: ${costs['transport']} (car ownership: {car_owned})
- Total: ${costs['total']}/month

Livability scoring instructions (all 0-10, higher = better for this user):

commute (0-10):
  - Consider the distance from {request.address} to "{work_addr or 'typical city center'}"
  - Consider their schedule ({schedule}) — remote=less commute impact, in-office=high impact
  - Consider their transport mode ({transport}) — car on highway vs cycling narrow roads matters
  - Low score if: far from work, daily commute, slow transport mode
  - High score if: close to work, remote/hybrid, fast transit or walkable

healthcare (0-10):
  - Estimate based on your knowledge of proximity to hospitals, clinics, pharmacies near {request.address}

parks_recreation (0-10):
  - Consider their hobbies ({hobbies}) and recreation level ({recreation})
  - Estimate parks, trails, gyms, sports facilities near {request.address}
  - High recreation user + low parks nearby = lower score

noise_pollution (0-10):
  - 10=very quiet/clean, 1=very noisy/polluted
  - Consider proximity to highways, transit hubs, bars, construction near {request.address}

groceries (0-10):
  - Consider their shopping preference ({shopping}) and proximity to relevant stores
  - Budget shopper near premium-only stores = lower score
  - Premium shopper near discount stores = moderate score

transport (0-10):
  - Consider their mode ({transport}) and how well {request.address} supports it
  - Car user: consider parking, road access, traffic
  - Transit user: consider bus/train proximity, frequency
  - Walker/cyclist: consider walkability score, bike lanes, safety

Overall scores:
  - overall_score (0-10): weighted average considering user priorities
  - pros: 2-3 specific strengths FOR THIS USER at this address
  - warnings: 2-3 specific concerns FOR THIS USER at this address
  - summary: 1-2 sentence personalised summary mentioning their specific situation

Return ONLY this JSON:
{{"livability":{{"overall_score":0.0,"criteria":{{"commute":0,"healthcare":0,"parks_recreation":0,"noise_pollution":0,"groceries":0,"transport":0}},"pros":[],"warnings":[],"summary":""}}}}"""

    livability = None
    ai_error   = None
    try:
        raw = await generate_recommendation(prompt)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        parsed     = json.loads(raw.strip())
        livability = parsed.get("livability")
        if livability is None:
            raise ValueError("Missing 'livability' key in response")
        if not livability.get("overall_score"):
            criteria = livability.get("criteria", {})
            vals = [v for v in criteria.values() if isinstance(v, (int, float))]
            livability["overall_score"] = round(sum(vals) / len(vals), 1) if vals else 0
    except json.JSONDecodeError:
        ai_error = f"Gemini returned non-JSON: {raw[:300]}"
    except Exception as exc:
        ai_error = str(exc)
        
        
    # Extract livability score if AI succeeded
    solana_link = None
    score = None

    if ai_analysis and "summary" in ai_analysis:
        score = ai_analysis["summary"].get("livability_score")
    if score is not None:
        try:
            solana_link = write_score_to_solana(request.address, score)
        except Exception as exc:
            solana_link = None
            print("Solana write failed:", exc)


    # ── Cost breakdown with ranges ────────────────────────────────────────────
    # Range width reflects real uncertainty: commute & entertainment vary most
    cost_breakdown = {
        "grand_total": {
            "lowest":  round(costs["total"] * 0.88),
            "average": costs["total"],
            "highest": round(costs["total"] * 1.14),
        },
        "categories": {
            "rent":          _cost_ranges(costs["rent"],          0.94, 1.07),
            "commute":       _cost_ranges(costs["commute"],       0.75, 1.45),
            "groceries":     _cost_ranges(costs["groceries"],     0.88, 1.13),
            "utilities":     _cost_ranges(costs["utilities"],     0.83, 1.22),
            "entertainment": _cost_ranges(costs["entertainment"], 0.60, 1.50),
            "transport":     _cost_ranges(costs["transport"],     0.85, 1.25),
        },
        "insights": _generate_insights(costs, prefs),
    }

    return {
        "success":        ai_error is None,
        "address":        request.address,
        "coordinates":    {"lat": request.lat, "lng": request.lng},
        "livability":     livability,
        "cost_breakdown": cost_breakdown,
        "personalized":   has_prefs,
        "ai_error":       ai_error,
        "solana_tx":      solana_link,
    }
