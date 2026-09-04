"""Validated execution-plane settings loaded only from deployment configuration."""

from base64 import b64decode
from typing import Annotated
from urllib.parse import urlparse

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PositiveInt = Annotated[int, Field(gt=0)]
PositiveFloat = Annotated[float, Field(gt=0)]


class Settings(BaseSettings):
    EXECUTION_ENV: str
    EXECUTION_DEBUG: bool
    EXECUTION_LOG_LEVEL: str
    EXECUTION_API_HOST: str
    EXECUTION_API_PORT: Annotated[int, Field(ge=1, le=65535)]
    EXECUTION_API_WORKERS: PositiveInt

    EXECUTION_DATABASE_URL: str
    EXECUTION_DB_POOL_SIZE: PositiveInt
    EXECUTION_DB_MAX_OVERFLOW: Annotated[int, Field(ge=0)]
    CONTROL_PLANE_API_URL: str
    CONTROL_PLANE_TIMEOUT_SECONDS: PositiveFloat
    EXECUTION_EVENT_SOURCE_ID: str
    EXECUTION_EVENT_SIGNING_SECRET: SecretStr
    EXECUTION_EVENT_MAX_SKEW_SECONDS: PositiveInt
    OBSERVABILITY_METRICS_TOKEN: SecretStr

    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
    CELERY_VISIBILITY_TIMEOUT_SECONDS: PositiveInt
    CELERY_RESULT_EXPIRES_SECONDS: PositiveInt
    EXECUTION_TASK_SOFT_TIME_LIMIT_SECONDS: PositiveInt
    EXECUTION_TASK_TIME_LIMIT_SECONDS: PositiveInt
    EXECUTION_LEASE_SECONDS: PositiveInt
    EXECUTION_MAX_ATTEMPTS: Annotated[int, Field(ge=1, le=10)]
    EXECUTION_RETRY_BASE_SECONDS: PositiveFloat
    OUTBOX_BATCH_SIZE: Annotated[int, Field(ge=1, le=500)]
    OUTBOX_POLL_INTERVAL_SECONDS: PositiveFloat
    OUTBOX_MAX_ATTEMPTS: PositiveInt
    OUTBOX_RETRY_MAX_SECONDS: PositiveInt

    EXECUTION_CORS_ORIGINS: list[str]
    EXECUTION_HTTP_ALLOWED_HOSTS: list[str]
    EXECUTION_ALLOW_INSECURE_HTTP: bool
    EXECUTION_HTTP_ALLOW_PRIVATE_NETWORKS: bool
    EXECUTION_HTTP_TIMEOUT_SECONDS: PositiveFloat
    EXECUTION_HTTP_MAX_RESPONSE_BYTES: PositiveInt

    EXECUTION_PAYLOAD_ENCRYPTION_KEY: SecretStr
    EXECUTION_PAYLOAD_KEY_VERSION: str

    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        extra="ignore",
        case_sensitive=True,
    )

    @field_validator("CONTROL_PLANE_API_URL", "EXECUTION_CORS_ORIGINS")
    @classmethod
    def validate_absolute_http_urls(cls, value):
        values = value if isinstance(value, list) else [value]
        for item in values:
            parsed = urlparse(item)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("must contain absolute HTTP(S) URLs")
        return value

    @field_validator("EXECUTION_HTTP_ALLOWED_HOSTS")
    @classmethod
    def validate_allowed_hosts(cls, hosts: list[str]) -> list[str]:
        for host in hosts:
            if not host or "://" in host or "/" in host or host != host.lower():
                raise ValueError("must contain lowercase hostnames without schemes or paths")
        return hosts

    @field_validator("EXECUTION_EVENT_SOURCE_ID")
    @classmethod
    def validate_event_source_id(cls, value: str) -> str:
        if not value.strip() or len(value) > 128:
            raise ValueError("must contain 1-128 non-whitespace characters")
        return value

    @field_validator("EXECUTION_EVENT_SIGNING_SECRET", "OBSERVABILITY_METRICS_TOKEN")
    @classmethod
    def validate_service_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("must contain at least 32 characters")
        return value

    @field_validator("EXECUTION_PAYLOAD_ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, value: SecretStr) -> SecretStr:
        try:
            decoded = b64decode(value.get_secret_value(), validate=True)
        except ValueError as exc:
            raise ValueError("must be valid base64") from exc
        if len(decoded) != 32:
            raise ValueError("must decode to exactly 32 bytes")
        return value

    @model_validator(mode="after")
    def validate_time_limits(self):
        if self.EXECUTION_TASK_TIME_LIMIT_SECONDS <= self.EXECUTION_TASK_SOFT_TIME_LIMIT_SECONDS:
            raise ValueError(
                "EXECUTION_TASK_TIME_LIMIT_SECONDS must exceed the soft time limit"
            )
        return self


settings = Settings()
