from functools import lru_cache
from typing import Literal

from pydantic import Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment and optional `.env` file.

    Precedence (highest first): process environment variables override `.env` file
    values, which override defaults. See pydantic-settings documentation.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: Literal["development", "production"] = Field(
        default="development",
        validation_alias="ENV",
        description="Runtime environment; production enforces stricter checks.",
    )

    cors_origins: str = Field(
        default="http://127.0.0.1:5173,http://localhost:5173",
        validation_alias="CORS_ORIGINS",
        description="Comma-separated browser origins allowed by CORS.",
    )

    groq_base_url: str = Field(
        default="https://api.groq.com/openai/v1",
        validation_alias="GROQ_BASE_URL",
    )

    expose_docs: bool | None = Field(
        default=None,
        validation_alias="EXPOSE_DOCS",
        description="Override OpenAPI docs exposure; when unset, follows DEBUG behavior.",
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def debug(self) -> bool:
        return self.env == "development"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("cors_origins")
    @classmethod
    def _reject_wildcard_with_credentials_style(cls, v: str) -> str:
        origins = [o.strip() for o in v.split(",") if o.strip()]
        if any(o == "*" for o in origins):
            msg = "CORS_ORIGINS must not be '*' (explicit allowlist required)."
            raise ValueError(msg)
        return v

    def model_post_init(self, __context: object) -> None:
        if self.env == "production":
            if not self.cors_origin_list:
                msg = "CORS_ORIGINS must list at least one origin in production."
                raise ValueError(msg)


@lru_cache
def get_settings() -> Settings:
    return Settings()
