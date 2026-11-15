from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "Production Reference Backend Service"
    ENVIRONMENT: str = Field(default="development")
    DATABASE_URL: str = Field(default="sqlite+aiosqlite:///./test.db")
    LOG_LEVEL: str = Field(default="INFO")
    ALLOWED_ORIGINS: list[str] = Field(default=["*"])

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
