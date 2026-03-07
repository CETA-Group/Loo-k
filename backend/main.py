from fastapi import FastAPI
from pydantic import BaseModel
from backend.auth0 import verify_jwt
from fastapi import Depends

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