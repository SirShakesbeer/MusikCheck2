import random
import string
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.domain.models import IndexedTrack, Lobby, MediaSource, Player, Team
from app.domain.snippets import SnippetSpec
from app.domain.providers.base import MediaItem
from app.schemas.game_mode import GameModeFiltersState, GameModePresetState, RoundTypeRuleState
from app.schemas.game import GameState, PlayerState, RoundState, TeamState
from app.services.game_mode_service import GameModePreset, GameModeService
from app.services.media_processing_service import MediaProcessingService
from app.services.media_ingestion_service import MediaIngestionService


@dataclass
class RuntimeRound:
    media_item: MediaItem
    round_kind: str
    song_number: int
    stage_index: int
    can_guess: bool
    status: str
    snippet_url: str


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
        self._runtime_rounds: dict[str, RuntimeRound] = {}
        self._lobby_modes: dict[str, GameModePreset] = {}
        self._song_numbers: dict[str, int] = {}
        self._player_ready: dict[str, dict[str, bool]] = {}

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
    ) -> Lobby:
        resolved_mode = self.mode_service.resolve(preset_key, mode_override)
        lobby = Lobby(code=self._generate_code(db), host_name=host_name, mode_key=resolved_mode.key)
        db.add(lobby)
        db.commit()
        db.refresh(lobby)
        self._lobby_modes[lobby.code] = resolved_mode
        self._song_numbers[lobby.code] = 0
        self._player_ready[lobby.code] = {}
        return lobby

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
        self._player_ready.setdefault(lobby.code, {})[player.id] = False

    def set_player_ready(self, db: Session, lobby_code: str, player_id: str, ready: bool) -> None:
        lobby = self._find_lobby(db, lobby_code)
        player = db.query(Player).filter(Player.id == player_id, Player.lobby_id == lobby.id).first()
        if not player:
            raise ValueError("Player not found")

        self._player_ready.setdefault(lobby.code, {})[player.id] = bool(ready)

    def start_round(self, db: Session, lobby_code: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        mode = self._get_lobby_mode(lobby)
        song_number = self._song_numbers.get(lobby.code, 0) + 1
        self._song_numbers[lobby.code] = song_number
        round_kind = self.mode_service.pick_round_kind(mode, song_number)

        media_item = self._pick_round_media_item(db)
        snippet_spec = SnippetSpec(kind=round_kind, duration_seconds=mode.stage_durations[0], random_start=True)
        processed = self.media_processing.build_snippet(media_item, snippet_spec)
        self._runtime_rounds[lobby.code] = RuntimeRound(
            media_item=media_item,
            round_kind=round_kind,
            song_number=song_number,
            stage_index=0,
            can_guess=False,
            status="playing",
            snippet_url=processed.snippet_url,
        )

    def _pick_round_media_item(self, db: Session) -> MediaItem:
        if settings.test_mode:
            return MediaItem(
                source_id="placeholder-1",
                title="Never Gonna Give You Up",
                artist="Rick Astley",
                media_path="placeholder",
            )

        indexed_rows = (
            db.query(IndexedTrack, MediaSource)
            .join(MediaSource, IndexedTrack.source_id == MediaSource.id)
            .all()
        )
        playable_items: list[MediaItem] = []
        for indexed_track, source in indexed_rows:
            media_path: str | None = None
            if source.provider_key == "youtube_playlist":
                media_path = f"https://www.youtube.com/watch?v={indexed_track.file_path}"
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
            "No playable media available. Add/index a local or YouTube source, or enable TEST_MODE."
        )

    def stop_round(self, db: Session, lobby_code: str, team_id: str) -> None:
        self._find_lobby(db, lobby_code)
        round_state = self._runtime_rounds.get(lobby_code)
        if not round_state:
            raise ValueError("No active round")
        round_state.can_guess = True
        round_state.status = f"stopped_by:{team_id}"

    def submit_guess(self, db: Session, lobby_code: str, team_id: str, title: str, artist: str) -> bool:
        lobby = self._find_lobby(db, lobby_code)
        round_state = self._runtime_rounds.get(lobby_code)
        if not round_state or not round_state.can_guess:
            raise ValueError("No guess window active")

        mode = self._get_lobby_mode(lobby)
        correct = (
            round_state.media_item.title.strip().lower() == title.strip().lower()
            and round_state.media_item.artist.strip().lower() == artist.strip().lower()
        )
        if correct:
            team = db.query(Team).filter(Team.id == team_id, Team.lobby_id == lobby.id).first()
            if not team:
                raise ValueError("Team not found")
            points = mode.stage_points[round_state.stage_index]
            team.score += points
            db.commit()
            round_state.status = "finished"
            round_state.can_guess = False
        return correct

    def next_stage(self, db: Session, lobby_code: str) -> bool:
        lobby = self._find_lobby(db, lobby_code)
        mode = self._get_lobby_mode(lobby)
        round_state = self._runtime_rounds.get(lobby_code)
        if not round_state:
            raise ValueError("No active round")

        next_index = round_state.stage_index + 1
        if next_index >= len(mode.stage_durations):
            round_state.status = "finished"
            return False

        spec = SnippetSpec(kind=round_state.round_kind, duration_seconds=mode.stage_durations[next_index], random_start=True)
        processed = self.media_processing.build_snippet(round_state.media_item, spec)
        round_state.stage_index = next_index
        round_state.snippet_url = processed.snippet_url
        round_state.can_guess = False
        round_state.status = "playing"
        return True

    def get_state(self, db: Session, lobby_code: str, message: str | None = None) -> GameState:
        lobby = self._find_lobby(db, lobby_code)
        teams = db.query(Team).filter(Team.lobby_id == lobby.id).order_by(Team.name.asc()).all()
        players = db.query(Player).filter(Player.lobby_id == lobby.id).order_by(Player.name.asc()).all()
        mode = self._get_lobby_mode(lobby)

        runtime = self._runtime_rounds.get(lobby.code)
        current_round = None
        if runtime:
            current_round = RoundState(
                round_kind=runtime.round_kind,
                song_number=runtime.song_number,
                stage_index=runtime.stage_index,
                stage_duration_seconds=mode.stage_durations[runtime.stage_index],
                points_available=mode.stage_points[runtime.stage_index],
                snippet_url=runtime.snippet_url,
                can_guess=runtime.can_guess,
                status=runtime.status,
            )

        mode_state = GameModePresetState(
            key=mode.key,
            name=mode.name,
            stage_durations=mode.stage_durations,
            stage_points=mode.stage_points,
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
                    ready=self._player_ready.get(lobby.code, {}).get(p.id, False),
                )
                for p in players
            ],
            current_round=current_round,
            message=message,
        )

    def _find_lobby(self, db: Session, lobby_code: str) -> Lobby:
        lobby = db.query(Lobby).filter(Lobby.code == lobby_code).first()
        if not lobby:
            raise ValueError("Lobby not found")
        return lobby

    def _get_lobby_mode(self, lobby: Lobby) -> GameModePreset:
        mode = self._lobby_modes.get(lobby.code)
        if mode:
            return mode

        resolved = self.mode_service.resolve(lobby.mode_key)
        self._lobby_modes[lobby.code] = resolved
        self._song_numbers.setdefault(lobby.code, 0)
        self._player_ready.setdefault(lobby.code, {})
        return resolved
