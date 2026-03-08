from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MusikCheck2 API"
    api_prefix: str = "/api"
    database_url: str = "postgresql+psycopg://musikcheck:musikcheck@db:5432/musikcheck"
    media_root: str = "media"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
