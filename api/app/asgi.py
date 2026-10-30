# The module uvicorn runs (`app.asgi:app`). Kept apart from main.py so tests can
# import create_app without the environment variables production needs.
import sys
import time

started = time.monotonic()


def step(message: str) -> None:
    # Before uvicorn's own logging starts, so a start that hangs shows how far it
    # got in the Cloud Run logs (flushed: a killed process loses buffered output).
    print(f"startup: {message} ({time.monotonic() - started:.1f}s)", file=sys.stderr, flush=True)


step("importing the app")
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

step("imported")
app = create_app(Settings.from_env())
step("app built")
