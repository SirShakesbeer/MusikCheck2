import random
import string
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.domain.models import IndexedTrack, Lobby, MediaSource, Player, Team
from app.domain.providers.base import MediaItem
from app.schemas.game import GameState, PlayerState, RoundState, TeamState
from app.services.media_ingestion_service import MediaIngestionService
from app.services.game_mode_registry import GameModeRegistry
from app.services.media_processing_service import MediaProcessingService


@dataclass
class RuntimeRound:
    media_item: MediaItem
    stage_index: int
    can_guess: bool
    status: str
    snippet_url: str


class GameEngine:
    def __init__(
        self,
        mode_registry: GameModeRegistry,
        media_processing: MediaProcessingService,
        media_ingestion: MediaIngestionService,
    ):
        self.mode_registry = mode_registry
        self.media_processing = media_processing
        self.media_ingestion = media_ingestion
        self._runtime_rounds: dict[str, RuntimeRound] = {}

    def _generate_code(self, db: Session) -> str:
        while True:
            code = "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(6))
            exists = db.query(Lobby).filter(Lobby.code == code).first()
            if not exists:
                return code

    def create_lobby(self, db: Session, host_name: str, mode_key: str) -> Lobby:
        self.mode_registry.get(mode_key)
        lobby = Lobby(code=self._generate_code(db), host_name=host_name, mode_key=mode_key)
        db.add(lobby)
        db.commit()
        db.refresh(lobby)
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

    def start_round(self, db: Session, lobby_code: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        mode = self.mode_registry.get(lobby.mode_key)
        media_item = self._pick_round_media_item(db)
        snippet_spec = mode.snippet_for_stage(media_item, 0)
        processed = self.media_processing.build_snippet(media_item, snippet_spec)
        self._runtime_rounds[lobby.code] = RuntimeRound(
            media_item=media_item,
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

        indexed_tracks = db.query(IndexedTrack).all()
        if indexed_tracks:
            indexed_track = random.choice(indexed_tracks)
            source = db.query(MediaSource).filter(MediaSource.id == indexed_track.source_id).first()
            media_path = indexed_track.file_path
            if source and source.provider_key == "youtube_playlist":
                media_path = f"https://www.youtube.com/watch?v={indexed_track.file_path}"

            return MediaItem(
                source_id=indexed_track.id,
                title=indexed_track.title,
                artist=indexed_track.artist,
                media_path=media_path,
            )

        if settings.youtube_default_playlist:
            items = self.media_ingestion.import_from_source("youtube_playlist", settings.youtube_default_playlist)
            if items:
                return random.choice(items)

        raise ValueError("No media available. Add/index a source or enable TEST_MODE.")

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

        mode = self.mode_registry.get(lobby.mode_key)
        correct = mode.is_guess_correct(round_state.media_item, title, artist)
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
        mode = self.mode_registry.get(lobby.mode_key)
        round_state = self._runtime_rounds.get(lobby_code)
        if not round_state:
            raise ValueError("No active round")

        next_index = round_state.stage_index + 1
        if next_index >= len(mode.stage_durations):
            round_state.status = "finished"
            return False

        spec = mode.snippet_for_stage(round_state.media_item, next_index)
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
        mode = self.mode_registry.get(lobby.mode_key)

        runtime = self._runtime_rounds.get(lobby.code)
        current_round = None
        if runtime:
            current_round = RoundState(
                stage_index=runtime.stage_index,
                stage_duration_seconds=mode.stage_durations[runtime.stage_index],
                points_available=mode.stage_points[runtime.stage_index],
                snippet_url=runtime.snippet_url,
                can_guess=runtime.can_guess,
                status=runtime.status,
            )

        return GameState(
            lobby_code=lobby.code,
            mode_key=lobby.mode_key,
            teams=[TeamState(id=t.id, name=t.name, score=t.score) for t in teams],
            players=[PlayerState(id=p.id, name=p.name, team_id=p.team_id) for p in players],
            current_round=current_round,
            message=message,
        )

    def _find_lobby(self, db: Session, lobby_code: str) -> Lobby:
        lobby = db.query(Lobby).filter(Lobby.code == lobby_code).first()
        if not lobby:
            raise ValueError("Lobby not found")
        return lobby
