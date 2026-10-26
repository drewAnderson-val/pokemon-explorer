from fastapi import FastAPI

from app.config import Settings
from app.routes import health


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="Pokemon Explorer API")
    app.state.settings = settings
    app.include_router(health.router)
    return app
