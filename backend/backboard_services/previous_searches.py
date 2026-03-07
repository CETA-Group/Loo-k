from backboard_services import backboard
import time

async def save_search(user_id: str, query: str):
    await backboard.memory.append(
        f"user:{user_id}:saved_searches",
        {"query": query, "timestamp": time.time()}
    )

async def get_searches(user_id: str):
    return await backboard.memory.get(f"user:{user_id}:saved_searches") or []
