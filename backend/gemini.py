import asyncio
from google import genai

# Replace with teammate's API key (billing-enabled project required for gemini-2.0-flash)
client = genai.Client(api_key="AIzaSyAd-AVRF5CrDYjPiJpOV0CNUMNdhEEO9gI")

async def generate_recommendation(prompt: str) -> str:
    def _call():
        return client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        ).text
    return await asyncio.to_thread(_call)
