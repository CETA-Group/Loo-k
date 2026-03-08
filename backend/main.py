from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import math

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



def _mock_costs(lat: float, lng: float) -> dict:
    """Deterministic cost seed based on coordinates (mirrors frontend mock)."""
    seed_val = abs(math.sin(lat * 127.1 + lng * 311.7)) * 1e6

    def rand(min_v: int, max_v: int) -> int:
        nonlocal seed_val
        seed_val = (seed_val * 9301 + 49297) % 233280
        return round(min_v + (seed_val / 233280) * (max_v - min_v))

    rent          = rand(900,  2200)
    commute       = rand(100,  500)
    groceries     = rand(280,  650)
    utilities     = rand(90,   260)
    entertainment = rand(80,   350)
    transport     = rand(60,   200)
    return {
        "rent": rent,
        "commute": commute,
        "groceries": groceries,
        "utilities": utilities,
        "entertainment": entertainment,
        "transport": transport,
        "total": rent + commute + groceries + utilities + entertainment + transport,
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

@app.post("/api/cost-analysis")
async def api_cost_analysis(request: CostAnalysisRequest):
    """
    Analyse the true monthly cost for a single address.
    Generates mock cost data from coordinates, then asks Gemini to
    evaluate it against the user's preferences.
    """
    costs = _mock_costs(request.lat, request.lng)

    map_data = {
        "address": request.address,
        "coordinates": {"lat": request.lat, "lng": request.lng},
        "candidates": [{
            "id": "target_location",
            "label": request.address,
            "lat": request.lat,
            "lng": request.lng,
            "monthly_rent": costs["rent"],
            "commute_cost_monthly": costs["commute"],
            "grocery_cost_monthly": costs["groceries"],
            "utilities_monthly": costs["utilities"],
            "entertainment_monthly": costs["entertainment"],
            "transport_monthly": costs["transport"],
            "estimated_total_monthly": costs["total"],
            # Rough proxy scores for the 6 Gemini factors
            "healthcare_access_score": 7,
            "parks_recreation_score": 6,
            "noise_pollution_score": 6,
        }]
    }

    prompt = build_prompt(
        user_preferences=request.user_preferences,
        user_history={},
        map_data=map_data,
        is_logged_in=bool(request.user_preferences),
    )

    try:
        raw = await generate_recommendation(prompt)
        ai_analysis = json.loads(raw)
        ai_error = None
    except json.JSONDecodeError:
        ai_analysis = None
        ai_error = f"Gemini returned non-JSON: {raw[:300]}"
    except Exception as exc:
        ai_analysis = None
        ai_error = str(exc)

    return {
        "success": ai_error is None,
        "address": request.address,
        "coordinates": {"lat": request.lat, "lng": request.lng},
        "cost_breakdown": costs,
        "ai_analysis": ai_analysis,
        "ai_error": ai_error,
    }
