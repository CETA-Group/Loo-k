from backboard_services import backboard

async def log_outcome(user_id: str, outcome: dict):
    await backboard.memory.append(
        f"user:{user_id}:recommendation_outcomes",
        outcome
    )
