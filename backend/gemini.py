import asyncio
import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


async def generate_recommendation(prompt: str) -> str:
    def _call():
        return client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=1024,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        ).text
    return await asyncio.wait_for(asyncio.to_thread(_call), timeout=30)
