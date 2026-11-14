FROM ghcr.io/astral-sh/uv:0.10.12 AS uv
FROM python:3.12-slim

COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev
COPY lunawindow ./lunawindow
COPY data ./data
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "exec .venv/bin/uvicorn lunawindow.api:app --host 0.0.0.0 --port \"$PORT\""]
