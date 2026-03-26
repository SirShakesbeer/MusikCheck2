from pydantic import BaseModel, Field


class SpotifyAuthUrlResponse(BaseModel):
    auth_url: str


class SpotifyConnectionState(BaseModel):
    connected: bool
    expires_in_seconds: int | None = None


class SpotifyPlayRandomRequest(BaseModel):
    track_id: str = Field(min_length=1)
    track_duration_seconds: int = Field(ge=1)
    snippet_duration_seconds: int = Field(default=0, ge=0)
    device_id: str | None = None
    start_at_seconds: int | None = None


class SpotifyPlayRandomResponse(BaseModel):
    track_id: str
    position_ms: int


class SpotifyAccessTokenResponse(BaseModel):
    access_token: str


class SpotifyActivateDeviceRequest(BaseModel):
    device_id: str = Field(min_length=1)


class SpotifyActivateDeviceResponse(BaseModel):
    device_id: str
