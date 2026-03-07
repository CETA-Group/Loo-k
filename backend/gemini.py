import google.generativeai as genai
import json

genai.configure(
    api_key="AIzaSyByIwaf-bNdPl-6kaS2snvzI9Be7NUo7F4"
)

model = genai.GenerativeModel("gemini-1.5-flash")

async def generate_recommendation(prompt: str) -> str:
    """
    Generate a recommendation using Gemini AI
    """
    response = model.generate_content(prompt)
    return response.text
