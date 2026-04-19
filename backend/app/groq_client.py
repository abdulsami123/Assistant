from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.config import get_settings
from app.schemas import SuggestionItem, SuggestionsEnvelope

logger = structlog.get_logger(__name__)


class GroqError(Exception):
    def __init__(self, message: str, *, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def _groq_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


async def transcribe_audio(
    *,
    api_key: str,
    audio_bytes: bytes,
    filename: str,
    content_type: str,
    whisper_prompt: str | None,
) -> str:
    settings = get_settings()
    url = f"{settings.groq_base_url.rstrip('/')}/audio/transcriptions"
    data: dict[str, str] = {
        "model": "whisper-large-v3",
    }
    if whisper_prompt:
        data["prompt"] = whisper_prompt
    files = {"file": (filename, audio_bytes, content_type or "application/octet-stream")}
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            data=data,
            files=files,
        )
    if response.status_code >= 400:
        message = "Transcription provider returned an error."
        try:
            payload = response.json()
            err = payload.get("error")
            if isinstance(err, dict) and isinstance(err.get("message"), str):
                message = err["message"]
        except (TypeError, ValueError):
            pass
        logger.warning("groq_transcribe_failed", status=response.status_code, message=message)
        status_code = 400 if response.status_code == 400 else 502
        raise GroqError(message, status_code=status_code)
    payload = response.json()
    text = payload.get("text")
    if not isinstance(text, str):
        raise GroqError("Unexpected transcription response.", status_code=502)
    return text.strip()


async def generate_suggestions(
    *,
    api_key: str,
    model: str,
    temperature: float,
    system_prompt: str,
    user_prompt: str,
) -> list[SuggestionItem]:
    settings = get_settings()
    url = f"{settings.groq_base_url.rstrip('/')}/chat/completions"
    body: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        response = await client.post(url, headers=_groq_headers(api_key), json=body)
    if response.status_code >= 400:
        logger.warning("groq_suggestions_failed", status=response.status_code)
        raise GroqError("Suggestions provider returned an error.", status_code=502)
    payload = response.json()
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise GroqError("Unexpected suggestions response.") from exc
    if not isinstance(content, str):
        raise GroqError("Unexpected suggestions response.")
    try:
        envelope = SuggestionsEnvelope.model_validate_json(content)
    except ValueError:
        cleaned = _extract_json_object(content)
        envelope = SuggestionsEnvelope.model_validate_json(cleaned)
    if len(envelope.suggestions) != 3:
        raise GroqError("Suggestions model must return exactly three items.", status_code=502)
    return list(envelope.suggestions)


def _extract_json_object(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        msg = "No JSON object found in model output."
        raise ValueError(msg)
    return text[start : end + 1]
