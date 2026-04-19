from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.groq_client import GroqError, generate_suggestions, transcribe_audio
from app.schemas import (
    ChatRequest,
    ModelInfo,
    ModelListResponse,
    SuggestionsRequest,
    SuggestionsResponse,
    TranscribeResponse,
)

router = APIRouter()

_SUPPORTED_MODELS: list[ModelInfo] = [
    ModelInfo(id="openai/gpt-oss-120b", capability="chat"),
    ModelInfo(id="whisper-large-v3", capability="transcription"),
]


@router.get("/supported-models", response_model=ModelListResponse)
async def list_supported_models(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ModelListResponse:
    total = len(_SUPPORTED_MODELS)
    items = _SUPPORTED_MODELS[offset : offset + limit]
    return ModelListResponse(
        items=list(items),
        total=total,
        has_more=offset + limit < total,
    )


def groq_api_key(x_groq_api_key: Annotated[str | None, Header(alias="X-Groq-API-Key")] = None) -> str:
    if not x_groq_api_key or not x_groq_api_key.strip():
        raise HTTPException(status_code=401, detail="Missing Groq API key.")
    return x_groq_api_key.strip()


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_route(
    api_key: Annotated[str, Depends(groq_api_key)],
    audio: UploadFile = File(..., description="Recorded audio chunk."),
    whisper_prompt: str | None = Form(default=None),
) -> TranscribeResponse:
    if audio.filename is None:
        raise HTTPException(status_code=400, detail="Audio filename is required.")
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio payload.")
    try:
        text = await transcribe_audio(
            api_key=api_key,
            audio_bytes=content,
            filename=audio.filename,
            content_type=audio.content_type or "application/octet-stream",
            whisper_prompt=whisper_prompt,
        )
    except GroqError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return TranscribeResponse(text=text)


@router.post("/suggestions", response_model=SuggestionsResponse)
async def suggestions_route(
    payload: SuggestionsRequest,
    api_key: Annotated[str, Depends(groq_api_key)],
) -> SuggestionsResponse:
    try:
        items = await generate_suggestions(
            api_key=api_key,
            model=payload.model,
            temperature=payload.temperature,
            system_prompt=payload.system_prompt,
            user_prompt=payload.user_prompt,
        )
    except GroqError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return SuggestionsResponse(suggestions=items, total=len(items), has_more=False)


@router.post("/chat")
async def chat_route(
    payload: ChatRequest,
    api_key: Annotated[str, Depends(groq_api_key)],
) -> StreamingResponse:
    settings = get_settings()
    url = f"{settings.groq_base_url.rstrip('/')}/chat/completions"
    messages: list[dict[str, str]] = [m.model_dump() for m in payload.messages]
    body: dict[str, Any] = {
        "model": payload.model,
        "temperature": payload.temperature,
        "stream": True,
        "messages": messages,
    }
    if payload.max_tokens is not None:
        body["max_tokens"] = payload.max_tokens

    client = httpx.AsyncClient(timeout=httpx.Timeout(300.0))
    request = client.build_request(
        "POST",
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
    )
    response = await client.send(request, stream=True)
    if response.status_code >= 400:
        await response.aread()
        await response.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail="Chat provider returned an error.")

    async def event_stream() -> AsyncIterator[bytes]:
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
