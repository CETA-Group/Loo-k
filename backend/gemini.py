import google.generativeai as genai
from prompt_builder import build_prompt
import json

genai.configure(
    api_key="AIzaSyByIwaf-bNdPl-6kaS2snvzI9Be7NUo7F4"
)

model = genai.GenerativeModel("gemini-1.5-flash")

prompt = build_prompt(
    user_preferences=prefs,
    user_history=history,
    menu_data=menu,
    is_logged_in=user.is_authenticated,
)
response = gemini_client.complete(prompt)
data = json.loads(response.text)
