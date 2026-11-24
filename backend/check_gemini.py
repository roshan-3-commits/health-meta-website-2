r"""Check that the Gemini key in backend/.env works. The key itself is never printed.

Run from the backend folder:  .venv\Scripts\python check_gemini.py
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


def main() -> None:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        sys.exit("No key yet. Paste it in backend/.env after GEMINI_API_KEY= and save the file.")

    from google import genai

    from app.food import GEMINI_MODELS

    client = genai.Client(api_key=key)
    working = 0
    for model in GEMINI_MODELS:
        try:
            client.models.generate_content(model=model, contents="Reply with the single word: working")
            print(f"  working      {model}")
            working += 1
        except Exception as exc:  # noqa: BLE001 - show any failure in plain words
            if getattr(exc, "code", None) in (400, 401, 403):
                sys.exit(f"Google refused the key: {str(exc).replace(key, '<key hidden>')[:300]}")
            print(f"  not now      {model} ({str(exc).replace(key, '<key hidden>')[:60]})")
    if not working:
        sys.exit("The key was accepted, but no Gemini model answered. Try again in a few minutes.")
    print("Gemini is working. The scanner uses the first working model in this list.")


if __name__ == "__main__":
    main()
