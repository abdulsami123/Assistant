from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TranscribeResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    text: str


class SuggestionItem(BaseModel):
    model_config = ConfigDict(strict=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(min_length=1, max_length=160)
    preview: str = Field(min_length=1, max_length=800)


class SuggestionsRequest(BaseModel):
    model_config = ConfigDict(strict=True, str_strip_whitespace=True)

    transcript_excerpt: str = Field(min_length=1, max_length=200_000)
    system_prompt: str = Field(min_length=1, max_length=20_000)
    user_prompt: str = Field(min_length=1, max_length=20_000)
    model: str = Field(default="openai/gpt-oss-120b", max_length=128)
    temperature: float = Field(default=0.4, ge=0, le=2)


class SuggestionsEnvelope(BaseModel):
    model_config = ConfigDict(strict=True)

    suggestions: list[SuggestionItem]


class SuggestionsResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    batch_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    suggestions: list[SuggestionItem]
    total: int = Field(ge=0)
    has_more: bool = False


class ChatMessage(BaseModel):
    model_config = ConfigDict(strict=True, str_strip_whitespace=True)

    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=0, max_length=200_000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    messages: list[ChatMessage] = Field(min_length=1, max_length=200)
    model: str = Field(default="openai/gpt-oss-120b", max_length=128)
    temperature: float = Field(default=0.35, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=128_000)


class HealthResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    status: Literal["ok"] = "ok"


class ModelInfo(BaseModel):
    model_config = ConfigDict(strict=True)

    id: str
    capability: Literal["chat", "transcription"]


class ModelListResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    items: list[ModelInfo]
    total: int
    has_more: bool
