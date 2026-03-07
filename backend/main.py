from fastapi import FastAPI
from pydantic import BaseModel
from backend.auth0 import verify_jwt
from fastapi import Depends
from backboard_services.preferences import save_preferences, get_preferences
from backboard_services.user_history import add_history
from backboard_services.previous_searches import save_search
from backboard_services.previous_outcomes import log_outcome
from backboard_services.states import set_state, get_state

app = FastAPI()

class Item(BaseModel):
    name: str
    value: int

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
