import asyncio
from google import genai

# Replace with teammate's API key (billing-enabled project required for gemini-2.0-flash)
client = genai.Client(api_key="AIzaSyByIwaf-bNdPl-6kaS2snvzI9Be7NUo7F4")

API_KEY = os.getenv("GEMINI_API_KEY")

genai.configure(api_key=API_KEY)
client = genai.Client()

async def generate_recommendation(prompt: str) -> str:
    def _call():
        return client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        ).text
    return await asyncio.to_thread(_call)
