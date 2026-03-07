from backboard_services import backboard

async def set_state(user_id: str, state: dict):
    await backboard.state.set(f"user:{user_id}", state)

async def get_state(user_id: str):
    return await backboard.state.get(f"user:{user_id}")
