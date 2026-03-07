from fastapi import FastAPI
from pydantic import BaseModel
from backend.auth0 import verify_jwt
from fastapi import Depends
from backboard_services.preferences import save_preferences, get_preferences
from backboard_services.user_history import add_history, get_history
from backboard_services.previous_searches import save_search, get_searches
from backboard_services.previous_outcomes import log_outcome, get_outcomes
from backboard_services.states import set_state, get_state
from backboard_services.recommendation_service import recommend_housing

app = FastAPI()

class Item(BaseModel):
    name: str
    value: int

class HousingRecommendationRequest(BaseModel):
    user_id: str
    map_data: dict
    is_logged_in: bool = True

@app.post("/items")
def create_item(item: Item):
    return {"message": f"Received {item.name} with value {item.value}"}


@app.get("/protected")
def protected_route(user=Depends(verify_jwt)):
    return {"message": "OK", "user": user}

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
