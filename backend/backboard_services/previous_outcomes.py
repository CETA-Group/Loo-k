from backboard_services import backboard

async def log_outcome(user_id: str, outcome: dict):
    await backboard.memory.append(
        f"user:{user_id}:recommendation_outcomes",
        outcome
    )

async def get_outcomes(user_id: str):
    return await backboard.memory.get(f"user:{user_id}:recommendation_outcomes") or []
