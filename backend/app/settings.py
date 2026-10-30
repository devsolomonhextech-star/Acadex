from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.example"), extra="ignore")

    app_env: str = "development"
    secret_key: str = "development-key-change-before-deploying-0123456789"
    database_url: str = "postgresql+asyncpg://schoolos:local-only-change-me@localhost:5432/schoolos"
    redis_url: str = "redis://localhost:6379/0"
    allowed_origins: list[str] = ["http://localhost:5173"]
    cookie_secure: bool = False
    access_token_minutes: int = 10
    refresh_token_days: int = 14
    paystack_secret_key: str | None = None
    frontend_url: str = "http://localhost:5173"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_starttls: bool = True

    def model_post_init(self, __context: object, /) -> None:
        if self.app_env == "production":
            if len(self.secret_key) < 32 or self.secret_key.startswith(("development-", "replace-this")):
                raise ValueError("SECRET_KEY must be a unique random value of at least 32 characters")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be enabled in production")
            if not self.smtp_host or not self.smtp_from_email:
                raise ValueError("SMTP_HOST and SMTP_FROM_EMAIL must be configured in production")
            if self.smtp_host.casefold() in {"mailpit", "localhost", "127.0.0.1"}:
                raise ValueError("Production must use a real SMTP relay, not a local mail catcher")


@lru_cache
def get_settings() -> Settings:
    return Settings()
