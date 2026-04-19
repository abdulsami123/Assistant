# TwinMind

TwinMind is a full-stack “meeting copilot” demo: live microphone capture with periodic Whisper transcription, batched GPT‑OSS suggestions, and a streaming copilot chat grounded in the transcript. The UI is a three-column studio inspired by dense glass dashboards (see functional layout requirements in the product brief).

## Stack

- **Backend:** FastAPI + Pydantic v2 + HTTPX + structlog, served by Uvicorn.
- **Frontend:** Vite + React + TypeScript + Tailwind CSS v4 + React Router + TanStack Query.
- **Models (Groq):** `whisper-large-v3` for transcription, `openai/gpt-oss-120b` for suggestions and chat (chat uses SSE streaming).

> **Route prefix note:** Product docs reference `/api/transcribe` style paths for readability. The implemented HTTP API is versioned under **`/api/v1/*`** (for example `POST /api/v1/transcribe`) plus `GET /health`, matching the engineering checklist.

## Quick start (local)

### Backend (uv)

Run commands from the **`backend/`** directory (the one that contains `pyproject.toml` and the `app/` folder), **not** from `backend/app/`. The app module path is `app.main:app`.

```bash
cd backend
uv sync
copy .env.example .env   # Windows; use cp on Unix
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# equivalent: uv run python main.py
```

If you see `ModuleNotFoundError: No module named 'app'`, you are almost certainly in the wrong directory or used `uvicorn main:app` instead of `uvicorn app.main:app`. See `backend/README.md`.

### Frontend (Vite)

```bash
cd frontend
npm install
copy .env.example .env.local   # optional; defaults work with the dev proxy
npm run dev
```

Open `http://localhost:5173`, paste a Groq API key in **Settings**, then open **Studio**.

### Docker Compose (optional)

```bash
docker compose up --build
```

This starts Postgres (reserved for future persistence), the API on `http://localhost:8000`, and the Vite dev server on `http://localhost:5173` with `VITE_API_URL=http://localhost:8000`.

## Environment variables

### Backend (`backend/.env`)

| Name | Required | Description |
| --- | --- | --- |
| `ENV` | No (`development`) | `development` or `production`. Production requires explicit `CORS_ORIGINS` entries and disables OpenAPI docs by default. |
| `CORS_ORIGINS` | Yes in production | Comma-separated browser origins. Wildcards (`*`) are rejected. |
| `GROQ_BASE_URL` | No | Groq OpenAI-compatible base URL (defaults to `https://api.groq.com/openai/v1`). |
| `EXPOSE_DOCS` | No | `true`/`false` override for `/docs` + `/openapi.json`. |

**Precedence:** process environment variables override values loaded from `.env` (pydantic-settings).

### Frontend (`frontend/.env.local`)

| Name | Required | Description |
| --- | --- | --- |
| `VITE_API_URL` | Recommended in production | Absolute API origin without a trailing slash. Leave empty in dev to use the Vite proxy (`/api` → backend). |
| `VITE_DEV_PROXY_TARGET` | No | Dev-only proxy upstream (defaults to `http://127.0.0.1:8000`). |

Only `VITE_*` variables are exposed to client code.

## CORS + production API URLs

- The backend uses an explicit CORS allowlist (`CORS_ORIGINS`). Credentials are **not** enabled; the Groq key is forwarded via the `X-Groq-API-Key` header on each request.
- **Development:** leave `VITE_API_URL` empty so the browser calls same-origin `/api/v1/*`, which Vite proxies to the FastAPI port.
- **Production:** set `VITE_API_URL` to the public origin of the API **unless** you terminate TLS at the same host and reverse-proxy `/api/v1` to the backend (true same-origin).

## API surface

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | `{ "status": "ok" }` |
| `GET` | `/api/v1/supported-models` | Paginated (`limit`, `offset`) static catalog for the models used in v1. |
| `POST` | `/api/v1/transcribe` | Multipart upload (`audio` file) + optional `whisper_prompt`. Requires `X-Groq-API-Key`. |
| `POST` | `/api/v1/suggestions` | JSON body with prompts + transcript excerpt. Returns exactly three suggestions. |
| `POST` | `/api/v1/chat` | JSON body with OpenAI-compatible `messages[]`. Streams Groq SSE (`text/event-stream`). |

Errors always return JSON `{"detail": ...}` where `detail` is either a string or a Pydantic validation list; the frontend client handles both shapes.

## Security notes

- **Groq API keys** are entered in the Settings UI and stored in `sessionStorage` for the tab session. They are proxied through this backend on every request; they are **not** `httpOnly`, so XSS can exfiltrate keys. Mitigations: strict CSP, avoid inline scripts, sanitize any rendered markdown/HTML, and prefer server-held secrets for production multitenant products.
- **OpenAPI docs** are disabled automatically in production unless `EXPOSE_DOCS=true`.
- **Structured logs** include `request_id`, `route`, `latency_ms`, and status (JSON in production).

## Product behavior (v1)

- **Column 1:** start/stop microphone, append transcript chunks on each Whisper response, auto-scroll.
- **Column 2:** auto-refresh suggestions on an interval while recording, manual refresh (flushes pending audio when live), three cards per batch, newest batches first.
- **Column 3:** tap a suggestion to append it to chat and stream a deeper answer; freeform chat is also supported. One continuous thread per tab session (no server persistence).
- **Export:** download JSON containing transcript chunks, suggestion batches, and chat messages with timestamps.
- **Deep links:** append `?panel=transcript|suggestions|chat` to `/studio` to scroll a specific column into view on load.

## Development scripts

| Area | Command |
| --- | --- |
| Frontend dev server | `cd frontend && npm run dev` |
| Frontend production build | `cd frontend && npm run build` |
| Backend dev server | `cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` |

## Known trade-offs / assumptions

- Postgres is included in Compose for future persistence but is **not wired** in v1 (the app is intentionally stateless).
- Whisper chunking depends on browser `MediaRecorder` mime types; Safari may require different containers—test with Chrome/Edge for the smoothest path.
- Suggestions require the model to emit strict JSON; the backend validates that exactly three suggestions are returned.
- Suggestions use `response_format: json_object` on Groq; if a future model ignores that flag, the route will return a 502 with a clear error instead of silently drifting UI state.
