from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    value: int

@app.post("/items")
def create_item(item: Item):
    return {"message": f"Received {item.name} with value {item.value}"}
