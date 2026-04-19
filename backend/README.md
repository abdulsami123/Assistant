# TwinMind backend

## Run the API

**Working directory must be this folder** (`backend/`, where `pyproject.toml` and the `app/` package live).

```bash
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Or:

```bash
uv run python main.py
```

### Common mistake

If you `cd app` and run `uvicorn main:app`, imports like `from app.config` fail with `ModuleNotFoundError: No module named 'app'`, because Python’s import root is wrong. Go up one level (`cd ..` to `backend/`) and use **`app.main:app`**, not `main:app`.
