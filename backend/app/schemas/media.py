from pydantic import BaseModel, Field


class IngestSourceRequest(BaseModel):
    provider_key: str = Field(min_length=1)
    source: str = Field(min_length=1)


class IngestedMediaItem(BaseModel):
    source_id: str
    title: str
    artist: str


class IngestSourceResponse(BaseModel):
    provider_key: str
    source: str
    imported_count: int
    preview_items: list[IngestedMediaItem]


class RegisterLocalSourceRequest(BaseModel):
    folder_path: str = Field(min_length=1)


class LocalSourceState(BaseModel):
    id: str
    provider_key: str
    source_value: str
    track_count: int


class RegisterLocalSourceResponse(BaseModel):
    source: LocalSourceState


class RunIndexResponse(BaseModel):
    source_id: str
    indexed_or_updated: int
    total_tracks: int


class RegisterSourceRequest(BaseModel):
    provider_key: str = Field(min_length=1)
    source: str = Field(min_length=1)


class RegisterSourceResponse(BaseModel):
    source: LocalSourceState


class RunSourceSyncResponse(BaseModel):
    source_id: str
    synced_or_updated: int
    total_tracks: int


class CleanupSourcesRequest(BaseModel):
    source_ids: list[str] = Field(default_factory=list)


class CleanupSourcesResponse(BaseModel):
    removed_source_ids: list[str]


class IndexedTrackState(BaseModel):
    id: str
    source_id: str
    provider_key: str
    source_value: str
    file_path: str
    title: str
    artist: str
    release_year: int | None = None
    playback_url: str
    duration_seconds: int | None = None


class ListIndexedTracksResponse(BaseModel):
    tracks: list[IndexedTrackState]


class AddSourceOrchestratedRequest(BaseModel):
    provider_key: str = Field(min_length=1)
    source: str = Field(min_length=1)
    lobby_code: str | None = None
    source_type: str | None = None


class AddSourceOrchestratedResponse(BaseModel):
    source_id: str
    total_tracks: int
