import os
from pydantic import Field

INSECURE_DEFAULT_SECRET = "dev-insecure-secret-key-change-in-production-1234567890"

def validate_production_secret(env: str, secret: str) -> None:
    """Fails closed if running in production/staging without a strong, non-default secret."""
    if env.lower() in ["production", "staging"]:
        if not secret or secret == INSECURE_DEFAULT_SECRET or len(secret) < 32:
            raise ValueError(
                f"FATAL SECURITY VIOLATION: Environment is '{env}', but JWT_SECRET is empty, default, or less than 32 characters. "
                "Application refuses to start with insecure cryptographic credentials."
            )

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    class Settings(BaseSettings):
        PROJECT_NAME: str = "Production Reference Backend Service"
        ENVIRONMENT: str = Field(default="development")
        DATABASE_URL: str = Field(default="sqlite+aiosqlite:////tmp/test.db")
        LOG_LEVEL: str = Field(default="INFO")
        JWT_SECRET: str = Field(default=INSECURE_DEFAULT_SECRET)
        ALLOWED_ORIGINS: list[str] = Field(default=[
            "http://localhost:3000",
            "http://localhost:8000",
            "https://app.example.com"
        ])

        model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            case_sensitive=True,
            extra="ignore"
        )
except ImportError:
    from pydantic import BaseModel
    class Settings(BaseModel):
        PROJECT_NAME: str = os.environ.get("PROJECT_NAME", "Production Reference Backend Service")
        ENVIRONMENT: str = os.environ.get("ENVIRONMENT", "development")
        DATABASE_URL: str = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:////tmp/test.db")
        LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")
        JWT_SECRET: str = os.environ.get("JWT_SECRET", INSECURE_DEFAULT_SECRET)
        ALLOWED_ORIGINS: list[str] = [
            "http://localhost:3000",
            "http://localhost:8000",
            "https://app.example.com"
        ]

settings = Settings()
validate_production_secret(settings.ENVIRONMENT, settings.JWT_SECRET)
