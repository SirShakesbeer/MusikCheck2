from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.ws_manager import ws_manager
from app.schemas.media import (
    AddSourceOrchestratedRequest,
    AddSourceOrchestratedResponse,
    CleanupSourcesRequest,
    CleanupSourcesResponse,
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
from app.schemas.spotify import (
    SpotifyAccessTokenResponse,
    SpotifyActivateDeviceRequest,
    SpotifyActivateDeviceResponse,
    SpotifyAuthUrlResponse,
    SpotifyConnectionState,
    SpotifyPlayRandomRequest,
    SpotifyPlayRandomResponse,
)
from app.schemas.game import (
    ApiEnvelope,
    CreateLobbyRequest,
    GuessRequest,
    JoinLobbyRequest,
    LobbySetupState,
    LobbySpotifyStateRequest,
    LobbySourceState,
    LobbyReadinessState,
    PlayStageRequest,
    PlayerReadyRequest,
    RuntimeConfigState,
    RuntimeConfigUpdateRequest,
    SaveLobbySetupRequest,
    StopRequest,
    SyncTeamsRequest,
    TeamFactToggleRequest,
    TeamPenaltyRequest,
    UpdateLobbyModeRequest,
)
from app.schemas.game_mode import (
    CreateGameModePresetRequest,
    CreateGameModePresetResponse,
    GameModeFiltersState,
    GameModePresetState,
    RoundTypeRuleState,
    ValidateGameModeRequest,
    ValidateGameModeResponse,
)
from app.services.game_mode_service import RoundTypeRule
from app.services.service_container import (
    game_engine,
    game_mode_service,
    media_ingestion_service,
    media_library_service,
    spotify_oauth_service,
)

router = APIRouter()


@router.get("/modes")
def list_modes() -> dict:
    return {"ok": True, "data": game_mode_service.all_modes()}


@router.get("/game-modes", response_model=dict)
def list_game_modes() -> dict:
    data = [
        GameModePresetState(
            key=preset.key,
            name=preset.name,
            stage_durations=preset.stage_durations,
            stage_points=preset.stage_points,
            bonus_points_both=preset.bonus_points_both,
            wrong_guess_penalty=preset.wrong_guess_penalty,
            required_points_to_win=preset.required_points_to_win,
            round_rules=[
                RoundTypeRuleState(kind=rule.kind, every_n_songs=rule.every_n_songs)
                for rule in preset.round_rules
            ],
            filters=GameModeFiltersState(
                release_year_from=(
                    int(preset.filters.get("release_year_from"))
                    if preset.filters.get("release_year_from") not in (None, "")
                    else None
                ),
                release_year_to=(
                    int(preset.filters.get("release_year_to"))
                    if preset.filters.get("release_year_to") not in (None, "")
                    else None
                ),
                language=(
                    str(preset.filters.get("language"))
                    if preset.filters.get("language") not in (None, "")
                    else None
                ),
            ),
            requires_phone_connections=game_mode_service.mode_requires_phone_connections(preset),
        ).model_dump()
        for preset in game_mode_service.all_presets()
    ]
    return {"ok": True, "data": data}


@router.post("/game-modes", response_model=dict)
def create_game_mode(payload: CreateGameModePresetRequest) -> dict:
    try:
        preset = game_mode_service.build_custom_mode(
            name=payload.name,
            stage_durations=payload.config.stage_durations,
            stage_points=payload.config.stage_points,
            round_rules=[
                RoundTypeRule(kind=rule.kind, every_n_songs=rule.every_n_songs)
                for rule in payload.config.round_rules
            ],
            bonus_points_both=payload.config.bonus_points_both,
            wrong_guess_penalty=payload.config.wrong_guess_penalty,
            required_points_to_win=payload.config.required_points_to_win,
            filters=payload.config.filters.model_dump(),
        )
        saved = game_mode_service.save_preset(preset)
        data = CreateGameModePresetResponse(
            preset=GameModePresetState(
                key=saved.key,
                name=saved.name,
                stage_durations=saved.stage_durations,
                stage_points=saved.stage_points,
                bonus_points_both=saved.bonus_points_both,
                wrong_guess_penalty=saved.wrong_guess_penalty,
                required_points_to_win=saved.required_points_to_win,
                round_rules=[
                    RoundTypeRuleState(kind=rule.kind, every_n_songs=rule.every_n_songs)
                    for rule in saved.round_rules
                ],
                filters=GameModeFiltersState(
                    release_year_from=(
                        int(saved.filters.get("release_year_from"))
                        if saved.filters.get("release_year_from") not in (None, "")
                        else None
                    ),
                    release_year_to=(
                        int(saved.filters.get("release_year_to"))
                        if saved.filters.get("release_year_to") not in (None, "")
                        else None
                    ),
                    language=(
                        str(saved.filters.get("language"))
                        if saved.filters.get("language") not in (None, "")
                        else None
                    ),
                ),
                requires_phone_connections=game_mode_service.mode_requires_phone_connections(saved),
            )
        )
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/game-modes/validate", response_model=dict)
def validate_game_mode(payload: ValidateGameModeRequest) -> dict:
    """Validate a game mode configuration without saving it"""
    try:
        from app.services.game_mode_service import GameModePreset, RoundTypeRule
        
        preset = GameModePreset(
            key="temp",
            name="temp-validation",
            stage_durations=payload.config.stage_durations,
            stage_points=payload.config.stage_points,
            round_rules=[
                RoundTypeRule(kind=rule.kind, every_n_songs=rule.every_n_songs)
                for rule in payload.config.round_rules
            ],
            bonus_points_both=payload.config.bonus_points_both,
            wrong_guess_penalty=payload.config.wrong_guess_penalty,
            required_points_to_win=payload.config.required_points_to_win,
            filters=payload.config.filters.model_dump() if payload.config.filters else {},
        )
        preset.validate()
        response = ValidateGameModeResponse(valid=True, error=None)
        return {"ok": True, "data": response.model_dump()}
    except ValueError as error:
        response = ValidateGameModeResponse(valid=False, error=str(error))
        return {"ok": True, "data": response.model_dump()}


@router.get("/providers")
def list_providers() -> dict:
    return {"ok": True, "data": media_ingestion_service.providers}


@router.get("/spotify/auth-url", response_model=dict)
def get_spotify_auth_url() -> dict:
    try:
        data = SpotifyAuthUrlResponse(auth_url=spotify_oauth_service.auth_url())
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/spotify/callback")
def spotify_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        return HTMLResponse(f"<h3>Spotify authorization failed: {error}</h3>")
    if not code:
        raise HTTPException(status_code=400, detail="Missing Spotify authorization code")

    try:
        spotify_oauth_service.exchange_code(code, state)
    except ValueError as exc:
        return HTMLResponse(f"<h3>Spotify authorization failed: {exc}</h3>", status_code=400)

    return HTMLResponse(
        "<script>window.close()</script><p>Spotify connected. You can close this window.</p>"
    )


@router.get("/spotify/status", response_model=dict)
def spotify_status() -> dict:
    connected, expires = spotify_oauth_service.status()
    data = SpotifyConnectionState(connected=connected, expires_in_seconds=expires)
    return {"ok": True, "data": data.model_dump()}


@router.get("/spotify/access-token", response_model=dict)
def spotify_access_token() -> dict:
    try:
        data = SpotifyAccessTokenResponse(access_token=spotify_oauth_service.access_token())
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/spotify/play-random", response_model=dict)
def spotify_play_random(payload: SpotifyPlayRandomRequest) -> dict:
    try:
        position_ms = spotify_oauth_service.play_track_random(
            track_id=payload.track_id,
            track_duration_seconds=payload.track_duration_seconds,
            snippet_duration_seconds=payload.snippet_duration_seconds,
            device_id=payload.device_id,
            start_at_seconds=payload.start_at_seconds,
        )
        data = SpotifyPlayRandomResponse(track_id=payload.track_id, position_ms=position_ms)
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/spotify/activate-device", response_model=dict)
def spotify_activate_device(payload: SpotifyActivateDeviceRequest) -> dict:
    try:
        spotify_oauth_service.activate_device(payload.device_id)
        data = SpotifyActivateDeviceResponse(device_id=payload.device_id)
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


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


@router.post("/media/sources/cleanup", response_model=dict)
def cleanup_sources(payload: CleanupSourcesRequest, db: Session = Depends(get_db)):
    removed_source_ids = media_library_service.cleanup_sources(db, payload.source_ids)
    data = CleanupSourcesResponse(removed_source_ids=removed_source_ids)
    return {"ok": True, "data": data.model_dump()}


@router.post("/media/sources/add-orchestrated", response_model=dict)
def add_source_orchestrated(payload: AddSourceOrchestratedRequest, db: Session = Depends(get_db)):
    """Register a source and run index/sync in one orchestrated call"""
    try:
        # Register the source
        registered = media_library_service.register_source(db, payload.provider_key, payload.source)
        source_id = registered.id
        
        # Run index or sync based on provider type
        if payload.provider_key == "local_files":
            # For local sources, run index
            media_library_service.index_local_source(db, source_id)
        else:
            # For remote sources, import and sync
            items = media_ingestion_service.import_from_source(payload.provider_key, payload.source)
            media_library_service.sync_remote_source(db, source_id, items)
        
        # Get final track count
        total_tracks = media_library_service.get_source_track_count(db, source_id)

        if payload.lobby_code:
            game_engine.attach_source_to_lobby(
                db,
                payload.lobby_code,
                source_id,
                (payload.source_type or "local-folder"),
                payload.source,
            )
        
        data = AddSourceOrchestratedResponse(source_id=source_id, total_tracks=total_tracks)
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
                else f"https://open.spotify.com/track/{track.file_path}"
                if source.provider_key == "spotify_playlist"
                else ""
            ),
            duration_seconds=(
                youtube_durations.get(track.file_path)
                if source.provider_key == "youtube_playlist"
                else (track.file_size // 1000 if source.provider_key == "spotify_playlist" and track.file_size > 0 else None)
            ),
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
        custom_mode = None
        if payload.mode_config:
            custom_mode = game_mode_service.build_custom_mode(
                name=(payload.preset_name or "Custom Mode"),
                stage_durations=payload.mode_config.stage_durations,
                stage_points=payload.mode_config.stage_points,
                round_rules=[
                    RoundTypeRule(kind=rule.kind, every_n_songs=rule.every_n_songs)
                    for rule in payload.mode_config.round_rules
                ],
                bonus_points_both=payload.mode_config.bonus_points_both,
                wrong_guess_penalty=payload.mode_config.wrong_guess_penalty,
                required_points_to_win=payload.mode_config.required_points_to_win,
                filters=payload.mode_config.filters.model_dump(),
            )
            if payload.save_as_preset:
                custom_mode = game_mode_service.save_preset(custom_mode)

        lobby = game_engine.create_lobby(db, payload.host_name, payload.preset_key, custom_mode, payload.teams)
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


@router.post("/lobbies/{code}/players/ready", response_model=ApiEnvelope)
async def update_player_ready(code: str, payload: PlayerReadyRequest, db: Session = Depends(get_db)):
    try:
        game_engine.set_player_ready(db, code, payload.player_id, payload.ready)
        state = game_engine.get_state(db, code, message="Player readiness updated")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/teams/sync", response_model=ApiEnvelope)
async def sync_lobby_teams(code: str, payload: SyncTeamsRequest, db: Session = Depends(get_db)):
    try:
        game_engine.sync_lobby_teams(db, code, payload.teams)
        state = game_engine.get_state(db, code, message="Teams synced")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/setup", response_model=dict)
async def save_lobby_setup(code: str, payload: SaveLobbySetupRequest, db: Session = Depends(get_db)):
    try:
        custom_mode = None
        if payload.mode_config:
            custom_mode = game_mode_service.build_custom_mode(
                name=(payload.mode_title or "Game Mode Details"),
                stage_durations=payload.mode_config.stage_durations,
                stage_points=payload.mode_config.stage_points,
                round_rules=[
                    RoundTypeRule(kind=rule.kind, every_n_songs=rule.every_n_songs)
                    for rule in payload.mode_config.round_rules
                ],
                bonus_points_both=payload.mode_config.bonus_points_both,
                wrong_guess_penalty=payload.mode_config.wrong_guess_penalty,
                required_points_to_win=payload.mode_config.required_points_to_win,
                filters=payload.mode_config.filters.model_dump(),
            )

        game_engine.save_lobby_setup(
            db,
            code,
            host_name=payload.host_name,
            team_names=payload.teams,
            spotify_connected=payload.spotify_connected,
            mode_title=payload.mode_title,
        )
        game_engine.update_lobby_mode(db, code, payload.preset_key, custom_mode)

        data = LobbySetupState(**game_engine.get_lobby_setup(db, code))
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/lobbies/{code}/setup", response_model=dict)
def get_lobby_setup(code: str, db: Session = Depends(get_db)):
    try:
        data = LobbySetupState(**game_engine.get_lobby_setup(db, code))
        return {"ok": True, "data": data.model_dump()}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/lobbies/{code}/sources", response_model=dict)
def get_lobby_sources(code: str, db: Session = Depends(get_db)):
    try:
        rows = game_engine.list_lobby_sources(db, code)
        data = [LobbySourceState(**row).model_dump() for row in rows]
        return {"ok": True, "data": data}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/lobbies/{code}/sources/remove", response_model=dict)
def remove_lobby_source(code: str, payload: CleanupSourcesRequest, db: Session = Depends(get_db)):
    try:
        for source_id in payload.source_ids:
            game_engine.remove_source_from_lobby(db, code, source_id)
        rows = game_engine.list_lobby_sources(db, code)
        data = [LobbySourceState(**row).model_dump() for row in rows]
        return {"ok": True, "data": data}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/lobbies/{code}/spotify", response_model=dict)
def set_lobby_spotify(code: str, payload: LobbySpotifyStateRequest, db: Session = Depends(get_db)):
    try:
        game_engine.set_lobby_spotify_connected(db, code, payload.connected)
        return {"ok": True, "data": {"connected": bool(payload.connected)}}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/lobbies/{code}/mode", response_model=ApiEnvelope)
async def update_lobby_mode(code: str, payload: UpdateLobbyModeRequest, db: Session = Depends(get_db)):
    try:
        custom_mode = None
        if payload.mode_config:
            custom_mode = game_mode_service.build_custom_mode(
                name="Updated Mode",
                stage_durations=payload.mode_config.stage_durations,
                stage_points=payload.mode_config.stage_points,
                round_rules=[
                    RoundTypeRule(kind=rule.kind, every_n_songs=rule.every_n_songs)
                    for rule in payload.mode_config.round_rules
                ],
                bonus_points_both=payload.mode_config.bonus_points_both,
                wrong_guess_penalty=payload.mode_config.wrong_guess_penalty,
                required_points_to_win=payload.mode_config.required_points_to_win,
                filters=payload.mode_config.filters.model_dump(),
            )
        
        game_engine.update_lobby_mode(db, code, payload.preset_key, custom_mode)
        state = game_engine.get_state(db, code, message="Lobby mode updated")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/lobbies/{code}/validate-start", response_model=dict)
def validate_lobby_start(code: str, db: Session = Depends(get_db)):
    try:
        readiness = game_engine.validate_lobby_ready_to_start(db, code)
        data = LobbyReadinessState(ready=readiness["ready"], issues=readiness["issues"])
        return {"ok": True, "data": data.model_dump()}
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


@router.post("/lobbies/{code}/rounds/next", response_model=ApiEnvelope)
async def next_round(code: str, db: Session = Depends(get_db)):
    try:
        game_engine.start_round(db, code)
        state = game_engine.get_state(db, code, message="Next round started")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/play-stage", response_model=ApiEnvelope)
async def play_stage(code: str, payload: PlayStageRequest, db: Session = Depends(get_db)):
    try:
        game_engine.play_stage(db, code, payload.stage_index)
        state = game_engine.get_state(db, code, message=f"Playing stage {payload.stage_index + 1}")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/finish", response_model=ApiEnvelope)
async def finish_round(code: str, db: Session = Depends(get_db)):
    try:
        game_engine.finish_round(db, code)
        state = game_engine.get_state(db, code, message="Round finished")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


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


@router.post("/lobbies/{code}/rounds/fact-toggle", response_model=ApiEnvelope)
async def toggle_round_fact(code: str, payload: TeamFactToggleRequest, db: Session = Depends(get_db)):
    try:
        game_engine.toggle_team_fact(db, code, payload.team_id, payload.fact)
        state = game_engine.get_state(db, code, message=f"Toggled {payload.fact}")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/wrong-guess-penalty", response_model=ApiEnvelope)
async def apply_wrong_guess_penalty(code: str, payload: TeamPenaltyRequest, db: Session = Depends(get_db)):
    try:
        game_engine.apply_wrong_guess_penalty(db, code, payload.team_id)
        state = game_engine.get_state(db, code, message="Wrong-guess penalty applied")
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
