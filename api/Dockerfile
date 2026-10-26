FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /bin/uv
WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app ./app

RUN useradd --create-home api
USER api
ENV PATH="/app/.venv/bin:$PATH"
# Cloud Run sets PORT. exec replaces the shell, so uvicorn receives SIGTERM and
# shuts down cleanly (closing its database connections) instead of being killed.
CMD ["sh", "-c", "exec uvicorn app.asgi:app --host 0.0.0.0 --port ${PORT:-8080}"]
