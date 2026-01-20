from functools import lru_cache
from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    database_url: str = Field("sqlite:///./edufad.db", env="DATABASE_URL")
    secret_key: str = Field("change-me", env="SECRET_KEY")
    access_token_expire_minutes: int = Field(60 * 8, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    admin_username: str = Field("admin", env="ADMIN_USERNAME")
    admin_password: str = Field("admin123", env="ADMIN_PASSWORD")
    timezone: str = Field("Europe/Rome", env="TZ")


@lru_cache
def get_settings() -> Settings:
    return Settings()
