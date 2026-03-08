import asyncio
import os
from dotenv import load_dotenv
from google import genai

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

async def generate_recommendation(prompt: str) -> str:
    def _call():
        return client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        ).text
    return await asyncio.to_thread(_call)
