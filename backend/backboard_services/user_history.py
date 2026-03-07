from backboard_services import backboard
import time

async def add_history(user_id: str, event: dict):
    event["timestamp"] = time.time()
    await backboard.memory.append(f"user:{user_id}:history", event)
