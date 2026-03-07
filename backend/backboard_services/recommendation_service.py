from backboard_services.preferences import get_preferences
from backboard_services.user_history import get_history
from backboard_services.previous_searches import get_searches
from backboard_services.previous_outcomes import get_outcomes
from backboard_services.states import get_state
from gemini import generate_recommendation
from prompt_builder import build_prompt
import json

async def recommend_housing(user_id: str, map_data: dict, is_logged_in: bool = True):
    """
    Generate housing recommendations using Backboard memory and Gemini AI
    """

    # Retrieve user data from Backboard
    user_preferences = await get_preferences(user_id) or {}
    user_history = await get_history(user_id) or []
    previous_searches = await get_searches(user_id) or []
    previous_outcomes = await get_outcomes(user_id) or []
    user_state = await get_state(user_id) or {}

    # Combine history data
    combined_history = {
        "interactions": user_history,
        "searches": previous_searches,
        "outcomes": previous_outcomes,
        "current_state": user_state
    }

    # Build the prompt
    prompt = build_prompt(
        user_preferences=user_preferences,
        user_history=combined_history,
        map_data=map_data,
        is_logged_in=is_logged_in
    )

    # Get AI recommendation
    response = await generate_recommendation(prompt)

    # Parse the JSON response
    try:
        recommendation_data = json.loads(response)
        return recommendation_data
    except json.JSONDecodeError:
        return {"error": "Failed to parse AI response", "raw_response": response}