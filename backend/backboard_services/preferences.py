from backboard_services import backboard

async def save_preferences(user_id: str, prefs: dict):
    await backboard.memory.set(f"user:{user_id}:preferences", prefs)

async def get_preferences(user_id: str):
    return await backboard.memory.get(f"user:{user_id}:preferences")
