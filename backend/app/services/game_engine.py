import json
import random
import string
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.core.config import settings
from app.domain.models import (
    ActiveRoundState,
    ActiveRoundTeamState,
    IndexedTrack,
    Lobby,
    LobbyRuntimeState,
    LobbySource,
    MediaSource,
    Player,
    PlayerRuntimeState,
    Team,
)
from app.domain.snippets import SnippetSpec
from app.domain.providers.base import MediaItem
from app.schemas.game_mode import GameModeFiltersState, GameModePresetState, RoundTypeRuleState
from app.schemas.game import GameState, PlayerState, RoundState, RoundTeamState, TeamState
from app.services.game_mode_service import GameModePreset, GameModeService, RoundTypeRule
from app.services.media_processing_service import MediaProcessingService
from app.services.media_ingestion_service import MediaIngestionService


class GameEngine:
    def __init__(
        self,
        mode_service: GameModeService,
        media_processing: MediaProcessingService,
        media_ingestion: MediaIngestionService,
    ):
        self.mode_service = mode_service
        self.media_processing = media_processing
        self.media_ingestion = media_ingestion
        self._lobby_modes: dict[str, GameModePreset] = {}

    def _serialize_mode(self, mode: GameModePreset | None) -> str:
        """Serialize a GameModePreset to JSON for database storage."""
        if not mode:
            return ""
        config_dict = {
            "key": mode.key,
            "name": mode.name,
            "stage_durations": mode.stage_durations,
            "stage_points": mode.stage_points,
            "bonus_points_both": mode.bonus_points_both,
            "wrong_guess_penalty": mode.wrong_guess_penalty,
            "required_points_to_win": mode.required_points_to_win,
            "round_rules": [{"kind": rule.kind, "every_n_songs": rule.every_n_songs} for rule in mode.round_rules],
            "filters": mode.filters,
        }
        return json.dumps(config_dict)

    def _deserialize_mode(self, mode_json: str | None, preset_key: str) -> GameModePreset | None:
        """Deserialize a JSON mode config and reconstruct the GameModePreset."""
        if not mode_json or not mode_json.strip():
            return None
        try:
            data = json.loads(mode_json)
            return GameModePreset(
                key=data.get("key", preset_key),
                name=data.get("name", "Custom"),
                stage_durations=data.get("stage_durations", []),
                stage_points=data.get("stage_points", []),
                round_rules=[
                    RoundTypeRule(kind=rule["kind"], every_n_songs=rule["every_n_songs"])
                    for rule in data.get("round_rules", [])
                ],
                bonus_points_both=data.get("bonus_points_both", 1),
                wrong_guess_penalty=data.get("wrong_guess_penalty", 0),
                required_points_to_win=data.get("required_points_to_win", 15),
                filters=data.get("filters", {}),
            )
        except (json.JSONDecodeError, KeyError, TypeError):
            return None

    def _generate_code(self, db: Session) -> str:
        while True:
            code = "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(6))
            exists = db.query(Lobby).filter(Lobby.code == code).first()
            if not exists:
                return code

    def create_lobby(
        self,
        db: Session,
        host_name: str,
        preset_key: str,
        mode_override: GameModePreset | None = None,
        teams: list[str] | None = None,
    ) -> Lobby:
        resolved_mode = self.mode_service.resolve(preset_key, mode_override)
        persisted_mode_key = resolved_mode.key
        if mode_override:
            # Custom mode overrides are stored in-memory for this process only.
            # Persist a known preset key to avoid failures after process restarts.
            all_presets = getattr(self.mode_service, "all_presets", None)
            if callable(all_presets):
                known_keys = {preset.key for preset in all_presets()}
                if resolved_mode.key not in known_keys:
                    fallback_key = (preset_key or "classic_audio").strip() or "classic_audio"
                    persisted_mode_key = fallback_key if fallback_key in known_keys else "classic_audio"

        lobby = Lobby(code=self._generate_code(db), host_name=host_name, mode_key=persisted_mode_key)
        db.add(lobby)
        db.commit()
        db.refresh(lobby)

        # Serialize the mode config (custom or default) for restart resilience
        mode_config_json = self._serialize_mode(mode_override if mode_override else resolved_mode)
        runtime_state = LobbyRuntimeState(lobby_id=lobby.id, song_number=0, mode_config=mode_config_json)
        db.add(runtime_state)
        db.commit()

        self.sync_lobby_teams(db, lobby.code, teams or [])

        self._lobby_modes[lobby.code] = resolved_mode
        return lobby

    def update_lobby_mode(
        self,
        db: Session,
        lobby_code: str,
        preset_key: str | None = None,
        mode_override: GameModePreset | None = None,
    ) -> None:
        """Update the game mode for an existing lobby and persist the config."""
        lobby = self._find_lobby(db, lobby_code)
        
        # Use provided preset_key or keep existing
        resolved_preset_key = preset_key or lobby.mode_key
        
        # Resolve the mode with the override if provided
        resolved_mode = self.mode_service.resolve(resolved_preset_key, mode_override)
        
        # Update the lobby's mode_key
        lobby.mode_key = resolved_mode.key
        
        # Serialize and persist the mode config
        mode_config_json = self._serialize_mode(mode_override if mode_override else resolved_mode)
        runtime_state = db.query(LobbyRuntimeState).filter(LobbyRuntimeState.lobby_id == lobby.id).first()
        if runtime_state:
            runtime_state.mode_config = mode_config_json
        
        # Update in-memory cache
        self._lobby_modes[lobby.code] = resolved_mode
        
        db.commit()

    def save_lobby_setup(
        self,
        db: Session,
        lobby_code: str,
        host_name: str,
        team_names: list[str],
        spotify_connected: bool = False,
        mode_title: str | None = None,
    ) -> None:
        lobby = self._find_lobby(db, lobby_code)
        runtime_state = self._get_or_create_lobby_runtime_state(db, lobby.id)

        lobby.host_name = host_name.strip() or lobby.host_name
        runtime_state.setup_teams = json.dumps(team_names)
        runtime_state.spotify_connected = bool(spotify_connected)
        if mode_title and mode_title.strip():
            runtime_state.setup_mode_title = mode_title.strip()

        self.sync_lobby_teams(db, lobby_code, team_names)
        db.commit()

    def get_lobby_setup(self, db: Session, lobby_code: str) -> dict:
        lobby = self._find_lobby(db, lobby_code)
        runtime_state = self._get_or_create_lobby_runtime_state(db, lobby.id)
        teams = db.query(Team).filter(Team.lobby_id == lobby.id).order_by(Team.name.asc()).all()

        parsed_teams: list[str]
        if runtime_state.setup_teams:
            try:
                parsed = json.loads(runtime_state.setup_teams)
                parsed_teams = [str(value).strip() for value in parsed if str(value).strip()]
            except (json.JSONDecodeError, TypeError):
                parsed_teams = [team.name for team in teams]
        else:
            parsed_teams = [team.name for team in teams]

        return {
            "host_name": lobby.host_name,
            "teams": parsed_teams,
            "preset_key": lobby.mode_key,
            "mode_title": runtime_state.setup_mode_title or "Game Mode Details",
            "spotify_connected": bool(runtime_state.spotify_connected),
        }

    def set_lobby_spotify_connected(self, db: Session, lobby_code: str, connected: bool) -> None:
        lobby = self._find_lobby(db, lobby_code)
        runtime_state = self._get_or_create_lobby_runtime_state(db, lobby.id)
        runtime_state.spotify_connected = bool(connected)
        db.commit()

    def attach_source_to_lobby(
        self,
        db: Session,
        lobby_code: str,
        source_id: str,
        source_type: str,
        source_value: str,
    ) -> None:
        lobby = self._find_lobby(db, lobby_code)
        source = db.query(MediaSource).filter(MediaSource.id == source_id).first()
        if not source:
            raise ValueError("Source not found")

        existing = (
            db.query(LobbySource)
            .filter(LobbySource.lobby_id == lobby.id, LobbySource.source_id == source.id)
            .first()
        )
        if existing:
            existing.source_type = source_type or existing.source_type
            existing.source_value = source_value or existing.source_value
            db.commit()
            return

        db.add(
            LobbySource(
                lobby_id=lobby.id,
                source_id=source.id,
                source_type=(source_type or "local-folder").strip(),
                source_value=(source_value or source.source_value).strip(),
            )
        )
        db.commit()

    def remove_source_from_lobby(self, db: Session, lobby_code: str, source_id: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        row = (
            db.query(LobbySource)
            .filter(LobbySource.lobby_id == lobby.id, LobbySource.source_id == source_id)
            .first()
        )
        if not row:
            return
        db.delete(row)
        db.commit()

    def list_lobby_sources(self, db: Session, lobby_code: str) -> list[dict]:
        lobby = self._find_lobby(db, lobby_code)
        rows = (
            db.query(LobbySource)
            .filter(LobbySource.lobby_id == lobby.id)
            .order_by(LobbySource.created_at.desc())
            .all()
        )
        sources: list[dict] = []
        for row in rows:
            imported_count = db.query(IndexedTrack).filter(IndexedTrack.source_id == row.source_id).count()
            sources.append(
                {
                    "source_id": row.source_id,
                    "source_type": row.source_type,
                    "source_value": row.source_value,
                    "imported_count": imported_count,
                }
            )
        return sources

    def cleanup_expired_lobbies_and_orphan_links(self, db: Session) -> dict[str, int]:
        now = datetime.utcnow()
        missing_expiry_rows = db.query(Lobby).filter(Lobby.expires_at.is_(None)).all()
        for lobby in missing_expiry_rows:
            lobby.expires_at = lobby.created_at + timedelta(hours=24)

        expired_lobbies = db.query(Lobby).filter(Lobby.expires_at.isnot(None), Lobby.expires_at < now).all()

        deleted_lobbies = 0
        deleted_links = 0
        deleted_rounds = 0

        for lobby in expired_lobbies:
            round_rows = db.query(ActiveRoundState).filter(ActiveRoundState.lobby_id == lobby.id).all()
            round_ids = [row.id for row in round_rows]

            if round_ids:
                deleted_rounds += (
                    db.query(ActiveRoundTeamState)
                    .filter(ActiveRoundTeamState.active_round_id.in_(round_ids))
                    .delete(synchronize_session=False)
                )

            db.query(ActiveRoundState).filter(ActiveRoundState.lobby_id == lobby.id).delete(synchronize_session=False)
            db.query(PlayerRuntimeState).filter(PlayerRuntimeState.lobby_id == lobby.id).delete(synchronize_session=False)
            db.query(Player).filter(Player.lobby_id == lobby.id).delete(synchronize_session=False)
            db.query(Team).filter(Team.lobby_id == lobby.id).delete(synchronize_session=False)
            db.query(LobbyRuntimeState).filter(LobbyRuntimeState.lobby_id == lobby.id).delete(synchronize_session=False)
            deleted_links += (
                db.query(LobbySource)
                .filter(LobbySource.lobby_id == lobby.id)
                .delete(synchronize_session=False)
            )
            db.query(Lobby).filter(Lobby.id == lobby.id).delete(synchronize_session=False)
            deleted_lobbies += 1

        valid_lobby_ids = [row.id for row in db.query(Lobby.id).all()]
        valid_source_ids = [row.id for row in db.query(MediaSource.id).all()]

        if valid_lobby_ids:
            deleted_links += (
                db.query(LobbySource)
                .filter(~LobbySource.lobby_id.in_(valid_lobby_ids))
                .delete(synchronize_session=False)
            )
        else:
            deleted_links += db.query(LobbySource).delete(synchronize_session=False)

        if valid_source_ids:
            deleted_links += (
                db.query(LobbySource)
                .filter(~LobbySource.source_id.in_(valid_source_ids))
                .delete(synchronize_session=False)
            )
        else:
            deleted_links += db.query(LobbySource).delete(synchronize_session=False)

        db.commit()
        return {
            "deleted_lobbies": deleted_lobbies,
            "deleted_links": deleted_links,
            "deleted_round_team_rows": deleted_rounds,
        }

    def sync_lobby_teams(self, db: Session, lobby_code: str, team_names: list[str]) -> None:
        lobby = self._find_lobby(db, lobby_code)

        normalized_names: list[str] = []
        seen: set[str] = set()
        for raw_name in team_names:
            name = raw_name.strip()
            if not name:
                continue
            lowered = name.lower()
            if lowered in seen:
                continue
            normalized_names.append(name)
            seen.add(lowered)

        existing_teams = db.query(Team).filter(Team.lobby_id == lobby.id).all()
        existing_by_lower = {team.name.strip().lower(): team for team in existing_teams}

        for name in normalized_names:
            if name.lower() in existing_by_lower:
                continue
            db.add(Team(lobby_id=lobby.id, name=name, score=0))

        db.commit()

    def validate_lobby_ready_to_start(self, db: Session, lobby_code: str) -> dict:
        lobby = self._find_lobby(db, lobby_code)
        issues: list[str] = []

        team_count = db.query(Team).filter(Team.lobby_id == lobby.id).count()
        if team_count < 1:
            issues.append("Add at least one team before starting the game.")

        if not settings.test_mode:
            linked_source_ids = [
                row.source_id
                for row in db.query(LobbySource).filter(LobbySource.lobby_id == lobby.id).all()
            ]
            total_tracks = (
                db.query(IndexedTrack)
                .filter(IndexedTrack.source_id.in_(linked_source_ids))
                .count()
                if linked_source_ids
                else 0
            )
            if total_tracks < 1:
                issues.append("Add and index at least one media source before starting the game.")

        return {
            "ready": len(issues) < 1,
            "issues": issues,
        }

    def _compute_snippet_offsets(self, track_duration_seconds: int, stage_durations: list[int]) -> list[int]:
        offsets: list[int] = []
        for duration in stage_durations:
            max_start = max(0, track_duration_seconds - max(1, duration))
            offsets.append(random.randint(0, max_start) if max_start > 0 else 0)
        return offsets

    def _normalize_playback_ref(self, provider_key: str, media_path: str) -> str:
        if provider_key == "spotify_playlist":
            return media_path.rsplit("/", 1)[-1]
        if provider_key == "youtube_playlist":
            if "v=" in media_path:
                return media_path.split("v=", 1)[1].split("&", 1)[0]
            return media_path.rsplit("/", 1)[-1]
        return media_path

    def _provider_display_name(self, provider_key: str | None) -> str:
        provider_labels = {
            "local_files": "Local Files",
            "local_folder": "Local Files",
            "youtube_playlist": "YouTube",
            "spotify_playlist": "Spotify",
            "text_list": "Text List",
        }
        return provider_labels.get((provider_key or "").strip(), (provider_key or "Source").strip() or "Source")

    def _resolve_reveal_source_label(self, db: Session, runtime: ActiveRoundState) -> str:
        provider_label = self._provider_display_name(runtime.playback_provider)
        indexed_track = db.query(IndexedTrack).filter(IndexedTrack.id == runtime.media_source_id).first()
        if not indexed_track:
            return provider_label

        source = db.query(MediaSource).filter(MediaSource.id == indexed_track.source_id).first()
        if not source:
            return provider_label

        source_name = self.media_ingestion.source_label(source.provider_key, source.source_value)
        if source_name:
            return f"{provider_label} | {source_name}"

        return provider_label

    def _pick_round_media_selection(self, db: Session, lobby_id: str) -> dict:
        media_item = self._pick_round_media_item(db, lobby_id)
        provider_key = "local_files"
        track_duration_seconds = 240
        playback_ref = media_item.media_path

        indexed_track = db.query(IndexedTrack).filter(IndexedTrack.id == media_item.source_id).first()
        if indexed_track:
            source = db.query(MediaSource).filter(MediaSource.id == indexed_track.source_id).first()
            if source:
                provider_key = source.provider_key
                if source.provider_key == "spotify_playlist" and indexed_track.file_size > 0:
                    track_duration_seconds = max(1, indexed_track.file_size // 1000)
                playback_ref = self._normalize_playback_ref(source.provider_key, media_item.media_path)

        return {
            "media_item": media_item,
            "provider_key": provider_key,
            "playback_ref": playback_ref,
            "track_duration_seconds": track_duration_seconds,
        }

    def _serialize_offsets(self, offsets: list[int]) -> str:
        return ",".join(str(max(0, int(value))) for value in offsets)

    def _deserialize_offsets(self, raw: str | None, expected_count: int) -> list[int]:
        if not raw:
            return [0 for _ in range(max(1, expected_count))]

        parsed: list[int] = []
        for token in raw.split(","):
            token = token.strip()
            if not token:
                continue
            try:
                parsed.append(max(0, int(token)))
            except ValueError:
                parsed.append(0)

        if len(parsed) < expected_count:
            parsed.extend([0 for _ in range(expected_count - len(parsed))])
        elif len(parsed) > expected_count:
            parsed = parsed[:expected_count]

        return parsed

    def join_team(self, db: Session, lobby_code: str, player_name: str, team_name: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        team = (
            db.query(Team)
            .filter(Team.lobby_id == lobby.id)
            .filter(Team.name.ilike(team_name))
            .first()
        )
        if not team:
            team = Team(lobby_id=lobby.id, name=team_name, score=0)
            db.add(team)
            db.flush()

        player = Player(lobby_id=lobby.id, team_id=team.id, name=player_name)
        db.add(player)
        db.commit()
        db.refresh(player)

        player_runtime = PlayerRuntimeState(player_id=player.id, lobby_id=lobby.id, ready=False)
        db.add(player_runtime)
        db.commit()

    def set_player_ready(self, db: Session, lobby_code: str, player_id: str, ready: bool) -> None:
        lobby = self._find_lobby(db, lobby_code)
        player = db.query(Player).filter(Player.id == player_id, Player.lobby_id == lobby.id).first()
        if not player:
            raise ValueError("Player not found")

        player_runtime = (
            db.query(PlayerRuntimeState)
            .filter(PlayerRuntimeState.player_id == player.id, PlayerRuntimeState.lobby_id == lobby.id)
            .first()
        )
        if not player_runtime:
            player_runtime = PlayerRuntimeState(player_id=player.id, lobby_id=lobby.id, ready=bool(ready))
            db.add(player_runtime)
        else:
            player_runtime.ready = bool(ready)
        db.commit()

    def start_round(self, db: Session, lobby_code: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        mode = self._get_lobby_mode(lobby, db)
        runtime_state = self._get_or_create_lobby_runtime_state(db, lobby.id)
        song_number = runtime_state.song_number + 1
        runtime_state.song_number = song_number
        round_kind = self.mode_service.pick_round_kind(mode, song_number)

        selection = self._pick_round_media_selection(db, lobby.id)
        media_item = selection["media_item"]
        snippet_offsets = self._compute_snippet_offsets(selection["track_duration_seconds"], mode.stage_durations)
        snippet_spec = SnippetSpec(kind=round_kind, duration_seconds=mode.stage_durations[0], random_start=False)
        processed = self.media_processing.build_snippet(media_item, snippet_spec)

        active_round = self._get_active_round(db, lobby.id)
        if not active_round:
            active_round = ActiveRoundState(
                lobby_id=lobby.id,
                media_source_id=media_item.source_id,
                media_title=media_item.title,
                media_artist=media_item.artist,
                media_path=media_item.media_path,
                round_kind=round_kind,
                song_number=song_number,
                stage_index=0,
                max_stage_reached=0,
                can_guess=False,
                status="ready",
                snippet_url=processed.snippet_url,
                playback_provider=selection["provider_key"],
                playback_ref=selection["playback_ref"],
                playback_token=0,
                track_duration_seconds=selection["track_duration_seconds"],
                snippet_start_offsets=self._serialize_offsets(snippet_offsets),
            )
            db.add(active_round)
        else:
            active_round.media_source_id = media_item.source_id
            active_round.media_title = media_item.title
            active_round.media_artist = media_item.artist
            active_round.media_path = media_item.media_path
            active_round.round_kind = round_kind
            active_round.song_number = song_number
            active_round.stage_index = 0
            active_round.max_stage_reached = 0
            active_round.can_guess = False
            active_round.status = "ready"
            active_round.snippet_url = processed.snippet_url
            active_round.playback_provider = selection["provider_key"]
            active_round.playback_ref = selection["playback_ref"]
            active_round.playback_token = 0
            active_round.track_duration_seconds = selection["track_duration_seconds"]
            active_round.snippet_start_offsets = self._serialize_offsets(snippet_offsets)

        db.query(ActiveRoundTeamState).filter(ActiveRoundTeamState.active_round_id == active_round.id).delete()

        db.commit()

    def play_stage(self, db: Session, lobby_code: str, stage_index: int) -> bool:
        lobby = self._find_lobby(db, lobby_code)
        mode = self._get_lobby_mode(lobby, db)
        round_state = self._get_active_round(db, lobby.id)
        if not round_state:
            raise ValueError("No active round")
        if round_state.status == "finished":
            raise ValueError("Round is finished")

        if stage_index < 0 or stage_index >= len(mode.stage_durations):
            raise ValueError("Requested stage is out of range")

        spec = SnippetSpec(kind=round_state.round_kind, duration_seconds=mode.stage_durations[stage_index], random_start=False)
        media_item = MediaItem(
            source_id=round_state.media_source_id,
            title=round_state.media_title,
            artist=round_state.media_artist,
            media_path=round_state.media_path,
        )
        try:
            processed = self.media_processing.build_snippet(media_item, spec)
            round_state.snippet_url = processed.snippet_url
        except ValueError:
            pass

        round_state.stage_index = stage_index
        current_max_stage = int(round_state.max_stage_reached or round_state.stage_index)
        round_state.max_stage_reached = max(current_max_stage, stage_index)
        round_state.can_guess = False
        round_state.status = "playing"
        round_state.playback_token = max(0, int(round_state.playback_token or 0)) + 1
        db.commit()
        return True

    def finish_round(self, db: Session, lobby_code: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        round_state = self._get_active_round(db, lobby.id)
        if not round_state:
            raise ValueError("No active round")
        round_state.status = "finished"
        round_state.can_guess = False
        db.commit()

    def _pick_round_media_item(self, db: Session, lobby_id: str) -> MediaItem:
        if settings.test_mode:
            return MediaItem(
                source_id="placeholder-1",
                title="Never Gonna Give You Up",
                artist="Rick Astley",
                media_path="placeholder",
            )

        linked_source_ids = [
            row.source_id
            for row in db.query(LobbySource).filter(LobbySource.lobby_id == lobby_id).all()
        ]
        indexed_rows = (
            db.query(IndexedTrack, MediaSource)
            .join(MediaSource, IndexedTrack.source_id == MediaSource.id)
            .filter(IndexedTrack.source_id.in_(linked_source_ids))
            .all()
        )
        playable_items: list[MediaItem] = []
        for indexed_track, source in indexed_rows:
            media_path: str | None = None
            if source.provider_key == "youtube_playlist":
                media_path = f"https://www.youtube.com/watch?v={indexed_track.file_path}"
            elif source.provider_key == "spotify_playlist":
                media_path = f"https://open.spotify.com/track/{indexed_track.file_path}"
            elif source.provider_key in {"local_folder", "local_files"}:
                media_path = f"/api/media/tracks/{indexed_track.id}/stream"
            else:
                continue

            playable_items.append(
                MediaItem(
                    source_id=indexed_track.id,
                    title=indexed_track.title,
                    artist=indexed_track.artist,
                    media_path=media_path,
                )
            )

        if playable_items:
            return random.choice(playable_items)

        if settings.youtube_default_playlist:
            items = self.media_ingestion.import_from_source("youtube_playlist", settings.youtube_default_playlist)
            if items:
                return random.choice(items)

        raise ValueError(
            "No playable media available. Add/index a local, YouTube, or Spotify source, or enable TEST_MODE."
        )

    def stop_round(self, db: Session, lobby_code: str, team_id: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        round_state = self._get_active_round(db, lobby.id)
        if not round_state:
            raise ValueError("No active round")
        round_state.can_guess = True
        round_state.status = f"stopped_by:{team_id}"
        db.commit()

    def submit_guess(self, db: Session, lobby_code: str, team_id: str, title: str, artist: str) -> bool:
        lobby = self._find_lobby(db, lobby_code)
        round_state = self._get_active_round(db, lobby.id)
        if not round_state or not round_state.can_guess:
            raise ValueError("No guess window active")

        mode = self._get_lobby_mode(lobby, db)
        correct = (
            round_state.media_title.strip().lower() == title.strip().lower()
            and round_state.media_artist.strip().lower() == artist.strip().lower()
        )
        if correct:
            team = db.query(Team).filter(Team.id == team_id, Team.lobby_id == lobby.id).first()
            if not team:
                raise ValueError("Team not found")
            max_stage_reached = int(round_state.max_stage_reached or round_state.stage_index)
            points_stage = max(0, min(len(mode.stage_points) - 1, max_stage_reached))
            points = mode.stage_points[points_stage]
            team.score += points
            db.commit()
            round_state.status = "finished"
            round_state.can_guess = False
        return correct

    def next_stage(self, db: Session, lobby_code: str) -> bool:
        lobby = self._find_lobby(db, lobby_code)
        mode = self._get_lobby_mode(lobby, db)
        round_state = self._get_active_round(db, lobby.id)
        if not round_state:
            raise ValueError("No active round")

        next_index = round_state.stage_index + 1
        if next_index >= len(mode.stage_durations):
            round_state.status = "finished"
            db.commit()
            return False

        return self.play_stage(db, lobby_code, next_index)

    def toggle_team_fact(self, db: Session, lobby_code: str, team_id: str, fact: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        team = db.query(Team).filter(Team.id == team_id, Team.lobby_id == lobby.id).first()
        if not team:
            raise ValueError("Team not found")

        round_state = self._get_active_round(db, lobby.id)
        if not round_state or round_state.status == "finished":
            raise ValueError("No active round")

        normalized_fact = fact.strip().lower()
        if normalized_fact not in {"artist", "title"}:
            raise ValueError("Fact must be either 'artist' or 'title'")

        mode = self._get_lobby_mode(lobby, db)
        max_stage_reached = int(round_state.max_stage_reached or round_state.stage_index)
        points_stage = max(0, min(len(mode.stage_points) - 1, max_stage_reached))
        fact_points = mode.stage_points[points_stage]
        both_bonus = max(0, int(mode.bonus_points_both))

        team_round_state = (
            db.query(ActiveRoundTeamState)
            .filter(
                ActiveRoundTeamState.active_round_id == round_state.id,
                ActiveRoundTeamState.team_id == team.id,
            )
            .first()
        )
        if not team_round_state:
            team_round_state = ActiveRoundTeamState(active_round_id=round_state.id, team_id=team.id)
            db.add(team_round_state)
            db.flush()

        current_artist = int(team_round_state.artist_points)
        current_title = int(team_round_state.title_points)
        current_bonus = int(team_round_state.bonus_points)
        artist_awarded_stage = team_round_state.artist_awarded_stage
        title_awarded_stage = team_round_state.title_awarded_stage

        if normalized_fact == "artist":
            selected_points = current_artist
            other_selected_points = current_title
            awarded_stage = artist_awarded_stage
        else:
            selected_points = current_title
            other_selected_points = current_artist
            awarded_stage = title_awarded_stage

        max_stage_reached = int(round_state.max_stage_reached or round_state.stage_index)

        delta = 0
        if selected_points > 0:
            if awarded_stage is not None and max_stage_reached > int(awarded_stage):
                raise ValueError("Cannot remove this fact after a higher snippet stage has been played")
            delta -= selected_points
            if normalized_fact == "artist":
                team_round_state.artist_points = 0
                team_round_state.artist_awarded_stage = None
            else:
                team_round_state.title_points = 0
                team_round_state.title_awarded_stage = None

            if current_bonus > 0:
                delta -= current_bonus
                team_round_state.bonus_points = 0
        else:
            delta += fact_points
            if normalized_fact == "artist":
                team_round_state.artist_points = fact_points
                team_round_state.artist_awarded_stage = max_stage_reached
            else:
                team_round_state.title_points = fact_points
                team_round_state.title_awarded_stage = max_stage_reached

            if other_selected_points > 0 and current_bonus < 1 and both_bonus > 0:
                delta += both_bonus
                team_round_state.bonus_points = both_bonus

        if delta != 0:
            team.score = max(0, team.score + delta)

        db.commit()

    def apply_wrong_guess_penalty(self, db: Session, lobby_code: str, team_id: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        team = db.query(Team).filter(Team.id == team_id, Team.lobby_id == lobby.id).first()
        if not team:
            raise ValueError("Team not found")

        mode = self._get_lobby_mode(lobby, db)
        penalty = max(0, int(mode.wrong_guess_penalty))
        if penalty < 1:
            return

        team.score = max(0, team.score - penalty)
        db.commit()

    def get_state(self, db: Session, lobby_code: str, message: str | None = None) -> GameState:
        lobby = self._find_lobby(db, lobby_code)
        teams = db.query(Team).filter(Team.lobby_id == lobby.id).order_by(Team.name.asc()).all()
        players = db.query(Player).filter(Player.lobby_id == lobby.id).order_by(Player.name.asc()).all()
        mode = self._get_lobby_mode(lobby, db)

        runtime = self._get_active_round(db, lobby.id)
        current_round = None
        round_team_states: list[RoundTeamState] = []
        if runtime:
            snippet_offsets = self._deserialize_offsets(runtime.snippet_start_offsets, len(mode.stage_durations))
            stage_duration = mode.stage_durations[runtime.stage_index]
            start_at_seconds = snippet_offsets[runtime.stage_index] if runtime.stage_index < len(snippet_offsets) else 0
            reveal_title: str | None = None
            reveal_artist: str | None = None
            reveal_source: str | None = None
            if runtime.status == "finished":
                reveal_title = runtime.media_title
                reveal_artist = runtime.media_artist
                reveal_source = self._resolve_reveal_source_label(db, runtime)

            current_round = RoundState(
                round_kind=runtime.round_kind,
                song_number=runtime.song_number,
                stage_index=runtime.stage_index,
                max_stage_reached=int(runtime.max_stage_reached or runtime.stage_index),
                stage_duration_seconds=stage_duration,
                points_available=mode.stage_points[runtime.stage_index],
                snippet_url=runtime.snippet_url,
                playback_provider=runtime.playback_provider,
                playback_ref=runtime.playback_ref,
                track_duration_seconds=int(runtime.track_duration_seconds),
                snippet_start_offsets=[int(value) for value in snippet_offsets],
                stage_playback={
                    "stage_index": runtime.stage_index,
                    "start_at_seconds": int(start_at_seconds),
                    "duration_seconds": stage_duration,
                },
                can_guess=runtime.can_guess,
                status=runtime.status,
                playback_token=max(0, int(runtime.playback_token or 0)),
                reveal_title=reveal_title,
                reveal_artist=reveal_artist,
                reveal_source=reveal_source,
            )

            team_state_rows = (
                db.query(ActiveRoundTeamState)
                .filter(ActiveRoundTeamState.active_round_id == runtime.id)
                .all()
            )
            round_team_states = [
                RoundTeamState(
                    team_id=row.team_id,
                    artist_points=row.artist_points,
                    title_points=row.title_points,
                    bonus_points=row.bonus_points,
                    artist_awarded_stage=row.artist_awarded_stage,
                    title_awarded_stage=row.title_awarded_stage,
                    artist_remove_locked=(
                        row.artist_awarded_stage is not None
                        and int(runtime.max_stage_reached or runtime.stage_index) > int(row.artist_awarded_stage)
                    ),
                    title_remove_locked=(
                        row.title_awarded_stage is not None
                        and int(runtime.max_stage_reached or runtime.stage_index) > int(row.title_awarded_stage)
                    ),
                )
                for row in team_state_rows
            ]

        readiness_rows = (
            db.query(PlayerRuntimeState)
            .filter(PlayerRuntimeState.lobby_id == lobby.id)
            .all()
        )
        ready_by_player = {row.player_id: row.ready for row in readiness_rows}

        mode_state = GameModePresetState(
            key=mode.key,
            name=mode.name,
            stage_durations=mode.stage_durations,
            stage_points=mode.stage_points,
            bonus_points_both=mode.bonus_points_both,
            wrong_guess_penalty=mode.wrong_guess_penalty,
            required_points_to_win=mode.required_points_to_win,
            round_rules=[
                RoundTypeRuleState(kind=rule.kind, every_n_songs=rule.every_n_songs)
                for rule in mode.round_rules
            ],
            filters=GameModeFiltersState(
                release_year_from=(
                    int(mode.filters.get("release_year_from"))
                    if mode.filters.get("release_year_from") not in (None, "")
                    else None
                ),
                release_year_to=(
                    int(mode.filters.get("release_year_to"))
                    if mode.filters.get("release_year_to") not in (None, "")
                    else None
                ),
                language=(
                    str(mode.filters.get("language"))
                    if mode.filters.get("language") not in (None, "")
                    else None
                ),
            ),
            requires_phone_connections=self.mode_service.mode_requires_phone_connections(mode),
        )

        return GameState(
            lobby_code=lobby.code,
            mode_key=lobby.mode_key,
            mode=mode_state,
            teams=[TeamState(id=t.id, name=t.name, score=t.score) for t in teams],
            players=[
                PlayerState(
                    id=p.id,
                    name=p.name,
                    team_id=p.team_id,
                    ready=ready_by_player.get(p.id, False),
                )
                for p in players
            ],
            current_round=current_round,
            round_team_states=round_team_states,
            message=message,
        )

    def _find_lobby(self, db: Session, lobby_code: str) -> Lobby:
        lobby = db.query(Lobby).filter(Lobby.code == lobby_code).first()
        if not lobby:
            raise ValueError("Lobby not found")

        if lobby.expires_at is None:
            lobby.expires_at = lobby.created_at + timedelta(hours=24)
            db.commit()

        if datetime.utcnow() > lobby.expires_at:
            raise ValueError("Lobby has expired")
        return lobby

    def _get_lobby_mode(self, lobby: Lobby, db: Session | None = None) -> GameModePreset:
        mode = self._lobby_modes.get(lobby.code)
        if mode:
            return mode

        # Check if there's a persisted mode config in the runtime state
        if db:
            runtime_state = db.query(LobbyRuntimeState).filter(LobbyRuntimeState.lobby_id == lobby.id).first()
            if runtime_state and runtime_state.mode_config:
                deserialized = self._deserialize_mode(runtime_state.mode_config, lobby.mode_key)
                if deserialized:
                    resolved = deserialized
                    self._lobby_modes[lobby.code] = resolved
                    return resolved

        try:
            resolved = self.mode_service.resolve(lobby.mode_key)
        except ValueError:
            # Recover gracefully for older lobbies that stored transient custom keys.
            resolved = self.mode_service.resolve("classic_audio")
        self._lobby_modes[lobby.code] = resolved
        return resolved

    def _get_or_create_lobby_runtime_state(self, db: Session, lobby_id: str) -> LobbyRuntimeState:
        runtime_state = (
            db.query(LobbyRuntimeState)
            .filter(LobbyRuntimeState.lobby_id == lobby_id)
            .first()
        )
        if runtime_state:
            return runtime_state

        runtime_state = LobbyRuntimeState(lobby_id=lobby_id, song_number=0)
        db.add(runtime_state)
        db.flush()
        return runtime_state

    def _get_active_round(self, db: Session, lobby_id: str) -> ActiveRoundState | None:
        return (
            db.query(ActiveRoundState)
            .filter(ActiveRoundState.lobby_id == lobby_id)
            .first()
        )
