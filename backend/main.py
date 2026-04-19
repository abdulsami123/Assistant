"""Local dev entrypoint.

Run **from the ``backend/`` directory** (the folder that contains ``pyproject.toml`` and the ``app/`` package), not
from ``backend/app/``::

    uv run python main.py

Equivalent::

    uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

Using ``uvicorn main:app`` inside ``backend/app/`` will fail because imports are absolute (``from app.…``) and
Python needs ``backend/`` on ``sys.path`` so the ``app`` package resolves.
"""

from __future__ import annotations


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
