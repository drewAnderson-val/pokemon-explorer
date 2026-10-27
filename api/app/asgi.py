# The module uvicorn runs (`app.asgi:app`). Kept apart from main.py so tests can
# import create_app without the environment variables production needs.
from app.config import Settings
from app.main import create_app

app = create_app(Settings.from_env())
