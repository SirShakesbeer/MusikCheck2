from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    app_name: str = "MusikCheck2 API"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./dev.db"
    media_root: str = "media"
    test_mode: bool = False
    youtube_api_key: str | None = None
    youtube_default_playlist: str | None = None
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None
    spotify_redirect_uri: str = "http://127.0.0.1:8000/api/spotify/callback"
    spotify_scopes: str = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state"

    model_config = SettingsConfigDict(env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore")


settings = Settings()
