from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.ws_manager import ws_manager
from app.schemas.media import (
    IndexedTrackState,
    IngestSourceRequest,
    IngestSourceResponse,
    IngestedMediaItem,
    ListIndexedTracksResponse,
    LocalSourceState,
    RegisterSourceRequest,
    RegisterSourceResponse,
    RegisterLocalSourceRequest,
    RegisterLocalSourceResponse,
    RunIndexResponse,
    RunSourceSyncResponse,
)
from app.schemas.game import (
    ApiEnvelope,
    CreateLobbyRequest,
    GuessRequest,
    JoinLobbyRequest,
    RuntimeConfigState,
    RuntimeConfigUpdateRequest,
    StopRequest,
)
from app.services.service_container import game_engine, game_mode_registry, media_ingestion_service, media_library_service

router = APIRouter()


@router.get("/modes")
def list_modes() -> dict:
    return {"ok": True, "data": game_mode_registry.all_modes()}


@router.get("/providers")
def list_providers() -> dict:
    return {"ok": True, "data": media_ingestion_service.providers}


@router.get("/runtime/config", response_model=dict)
def get_runtime_config() -> dict:
    data = RuntimeConfigState(
        test_mode=settings.test_mode,
        youtube_api_key_configured=bool(settings.youtube_api_key),
    )
    return {"ok": True, "data": data.model_dump()}


@router.post("/runtime/config", response_model=dict)
def update_runtime_config(payload: RuntimeConfigUpdateRequest) -> dict:
    settings.test_mode = payload.test_mode
    data = RuntimeConfigState(
        test_mode=settings.test_mode,
        youtube_api_key_configured=bool(settings.youtube_api_key),
    )
    return {"ok": True, "data": data.model_dump()}


@router.post("/media/ingest-preview", response_model=dict)
def ingest_preview(payload: IngestSourceRequest):
    try:
        items = media_ingestion_service.import_from_source(payload.provider_key, payload.source)
        preview = [
            IngestedMediaItem(source_id=item.source_id, title=item.title, artist=item.artist)
            for item in items[:10]
        ]
        data = IngestSourceResponse(
            provider_key=payload.provider_key,
            source=payload.source,
            imported_count=len(items),
            preview_items=preview,
        )
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/media/sources/local", response_model=dict)
def register_local_source(payload: RegisterLocalSourceRequest, db: Session = Depends(get_db)):
    try:
        source = media_library_service.register_local_source(db, payload.folder_path)
        track_count = media_library_service.get_source_track_count(db, source.id)
        data = RegisterLocalSourceResponse(
            source=LocalSourceState(
                id=source.id,
                provider_key=source.provider_key,
                source_value=source.source_value,
                track_count=track_count,
            )
        )
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/media/sources/register", response_model=dict)
def register_source(payload: RegisterSourceRequest, db: Session = Depends(get_db)):
    try:
        source = media_library_service.register_source(db, payload.provider_key, payload.source)
        track_count = media_library_service.get_source_track_count(db, source.id)
        data = RegisterSourceResponse(
            source=LocalSourceState(
                id=source.id,
                provider_key=source.provider_key,
                source_value=source.source_value,
                track_count=track_count,
            )
        )
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/media/sources/{source_id}/index", response_model=dict)
def run_local_source_index(source_id: str, db: Session = Depends(get_db)):
    try:
        changed = media_library_service.index_local_source(db, source_id)
        total = media_library_service.get_source_track_count(db, source_id)
        data = RunIndexResponse(source_id=source_id, indexed_or_updated=changed, total_tracks=total)
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/media/sources/{source_id}/sync", response_model=dict)
def run_source_sync(source_id: str, db: Session = Depends(get_db)):
    try:
        source = media_library_service.get_source(db, source_id)
        if not source:
            raise ValueError("Source not found")

        items = media_ingestion_service.import_from_source(source.provider_key, source.source_value)
        synced = media_library_service.sync_remote_source(db, source_id, items)
        total = media_library_service.get_source_track_count(db, source_id)
        data = RunSourceSyncResponse(source_id=source_id, synced_or_updated=synced, total_tracks=total)
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/media/sources", response_model=dict)
def list_media_sources(db: Session = Depends(get_db)):
    sources = media_library_service.list_sources(db)
    data = [
        LocalSourceState(
            id=source.id,
            provider_key=source.provider_key,
            source_value=source.source_value,
            track_count=media_library_service.get_source_track_count(db, source.id),
        ).model_dump()
        for source in sources
    ]
    return {"ok": True, "data": data}


@router.get("/media/tracks", response_model=dict)
def list_indexed_tracks(source_ids: str | None = None, limit: int = 500, db: Session = Depends(get_db)):
    parsed_source_ids = [value.strip() for value in (source_ids or "").split(",") if value.strip()]
    rows = media_library_service.list_indexed_tracks(db, parsed_source_ids or None, limit=max(1, min(limit, 1000)))

    youtube_rows = [(track, source) for track, source in rows if source.provider_key == "youtube_playlist"]
    youtube_video_ids = [track.file_path for track, _ in youtube_rows]
    youtube_durations: dict[str, int] = {}
    if youtube_video_ids:
        provider = media_ingestion_service.get_provider("youtube_playlist")
        if provider and hasattr(provider, "fetch_video_durations"):
            try:
                youtube_durations = provider.fetch_video_durations(youtube_video_ids)
            except ValueError:
                youtube_durations = {}

    tracks = [
        IndexedTrackState(
            id=track.id,
            source_id=track.source_id,
            provider_key=source.provider_key,
            source_value=source.source_value,
            file_path=track.file_path,
            title=track.title,
            artist=track.artist,
            playback_url=(
                f"/api/media/tracks/{track.id}/stream"
                if source.provider_key in {"local_folder", "local_files"}
                else f"https://www.youtube.com/embed/{track.file_path}?autoplay=1"
                if source.provider_key == "youtube_playlist"
                else ""
            ),
            duration_seconds=(youtube_durations.get(track.file_path) if source.provider_key == "youtube_playlist" else None),
        )
        for track, source in rows
    ]
    data = ListIndexedTracksResponse(tracks=tracks)
    return {"ok": True, "data": data.model_dump()}


@router.get("/media/tracks/{track_id}/stream")
def stream_indexed_track(track_id: str, db: Session = Depends(get_db)):
    row = media_library_service.get_indexed_track(db, track_id)
    if not row:
        raise HTTPException(status_code=404, detail="Track not found")

    track, source = row
    if source.provider_key not in {"local_folder", "local_files"}:
        raise HTTPException(status_code=400, detail="Streaming currently supported only for local tracks")

    return FileResponse(path=track.file_path)


@router.post("/lobbies", response_model=ApiEnvelope)
async def create_lobby(payload: CreateLobbyRequest, db: Session = Depends(get_db)):
    try:
        lobby = game_engine.create_lobby(db, payload.host_name, payload.mode_key)
        state = game_engine.get_state(db, lobby.code, message="Lobby created")
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/join", response_model=ApiEnvelope)
async def join_lobby(code: str, payload: JoinLobbyRequest, db: Session = Depends(get_db)):
    try:
        game_engine.join_team(db, code, payload.player_name, payload.team_name)
        state = game_engine.get_state(db, code, message=f"{payload.player_name} joined {payload.team_name}")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/start", response_model=ApiEnvelope)
async def start_round(code: str, db: Session = Depends(get_db)):
    try:
        game_engine.start_round(db, code)
        state = game_engine.get_state(db, code, message="Round started")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/stop", response_model=ApiEnvelope)
async def stop_round(code: str, payload: StopRequest, db: Session = Depends(get_db)):
    try:
        game_engine.stop_round(db, code, payload.team_id)
        state = game_engine.get_state(db, code, message=f"Stopped by {payload.player_name}")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/guess", response_model=ApiEnvelope)
async def submit_guess(code: str, payload: GuessRequest, db: Session = Depends(get_db)):
    try:
        correct = game_engine.submit_guess(db, code, payload.team_id, payload.title, payload.artist)
        message = "Correct guess!" if correct else "Incorrect guess"
        state = game_engine.get_state(db, code, message=message)
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/next-stage", response_model=ApiEnvelope)
async def next_stage(code: str, db: Session = Depends(get_db)):
    try:
        advanced = game_engine.next_stage(db, code)
        message = "Advanced stage" if advanced else "Round ended - no guess"
        state = game_engine.get_state(db, code, message=message)
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/lobbies/{code}", response_model=ApiEnvelope)
def get_lobby_state(code: str, db: Session = Depends(get_db)):
    try:
        return ApiEnvelope(data=game_engine.get_state(db, code))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
