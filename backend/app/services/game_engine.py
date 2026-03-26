import random
import string
import json
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.domain.models import (
    IndexedTrack,
    Lobby,
    LobbyHostRuntimeState,
    LobbyModeSnapshot,
    LobbyPlayerState,
    LobbyRuntimeRound,
    LobbyRoundTeamGuessState,
    MediaSource,
    Player,
    Team,
)
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

        mode_snapshot = LobbyModeSnapshot(
            lobby_id=lobby.id,
            mode_key=resolved_mode.key,
            payload_json=json.dumps(resolved_mode.to_dict()),
        )
        db.add(mode_snapshot)
        db.commit()

        self._lobby_modes[lobby.code] = resolved_mode
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
        player_state = LobbyPlayerState(lobby_id=lobby.id, player_id=player.id, ready=False)
        db.add(player_state)
        db.commit()

    def set_lobby_teams(self, db: Session, lobby_code: str, team_names: list[str]) -> None:
        lobby = self._find_lobby(db, lobby_code)
        normalized_names = [name.strip() for name in team_names if name and name.strip()]
        if not normalized_names:
            raise ValueError("At least one team is required")

        existing = db.query(Team).filter(Team.lobby_id == lobby.id).all()
        existing_by_name = {team.name.lower(): team for team in existing}
        for name in normalized_names:
            if name.lower() in existing_by_name:
                continue
            db.add(Team(lobby_id=lobby.id, name=name, score=0))

        db.commit()

    def set_player_ready(self, db: Session, lobby_code: str, player_id: str, ready: bool) -> None:
        lobby = self._find_lobby(db, lobby_code)
        player = db.query(Player).filter(Player.id == player_id, Player.lobby_id == lobby.id).first()
        if not player:
            raise ValueError("Player not found")

        player_state = (
            db.query(LobbyPlayerState)
            .filter(LobbyPlayerState.lobby_id == lobby.id, LobbyPlayerState.player_id == player.id)
            .first()
        )
        if not player_state:
            player_state = LobbyPlayerState(lobby_id=lobby.id, player_id=player.id, ready=bool(ready))
            db.add(player_state)
        else:
            player_state.ready = bool(ready)
        db.commit()

    def start_round(self, db: Session, lobby_code: str) -> None:
        lobby = self._find_lobby(db, lobby_code)
        mode = self._get_lobby_mode(db, lobby)
        latest_round = self._get_latest_round_record(db, lobby.id)
        song_number = (latest_round.song_number + 1) if latest_round else 1
        round_kind = self.mode_service.pick_round_kind(mode, song_number)

        # Reset team guesses for the new round
        self.reset_round_team_guesses(db, lobby.id)

        media_item = self._pick_round_media_item(db)
        snippet_spec = SnippetSpec(kind=round_kind, duration_seconds=mode.stage_durations[0], random_start=True)
        processed = self.media_processing.build_snippet(media_item, snippet_spec)
        runtime_round = RuntimeRound(
            media_item=media_item,
            round_kind=round_kind,
            song_number=song_number,
            stage_index=0,
            can_guess=False,
            status="playing",
            snippet_url=processed.snippet_url,
        )
        self._runtime_rounds[lobby.code] = runtime_round
        self._save_runtime_round(db, lobby.id, runtime_round)

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
            elif source.provider_key == "spotify_playlist":
                # Spotify track ID stored in file_path - use spotify URI for Web Playback SDK
                media_path = f"spotify:track:{indexed_track.file_path}"
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
        lobby = self._find_lobby(db, lobby_code)
        round_state = self._runtime_rounds.get(lobby_code) or self._load_runtime_round(db, lobby)
        if not round_state:
            raise ValueError("No active round")
        round_state.can_guess = True
        round_state.status = f"stopped_by:{team_id}"
        self._save_runtime_round(db, lobby.id, round_state)

    def submit_guess(self, db: Session, lobby_code: str, team_id: str, title: str, artist: str) -> bool:
        lobby = self._find_lobby(db, lobby_code)
        round_state = self._runtime_rounds.get(lobby_code) or self._load_runtime_round(db, lobby)
        if not round_state or not round_state.can_guess:
            raise ValueError("No guess window active")

        mode = self._get_lobby_mode(db, lobby)
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
            round_state.status = "finished"
            round_state.can_guess = False
            self._save_runtime_round(db, lobby.id, round_state)
            db.commit()
        return correct

    def next_stage(self, db: Session, lobby_code: str) -> bool:
        lobby = self._find_lobby(db, lobby_code)
        mode = self._get_lobby_mode(db, lobby)
        round_state = self._runtime_rounds.get(lobby_code) or self._load_runtime_round(db, lobby)
        if not round_state:
            raise ValueError("No active round")

        next_index = round_state.stage_index + 1
        if next_index >= len(mode.stage_durations):
            round_state.status = "finished"
            self._save_runtime_round(db, lobby.id, round_state)
            return False

        spec = SnippetSpec(kind=round_state.round_kind, duration_seconds=mode.stage_durations[next_index], random_start=True)
        processed = self.media_processing.build_snippet(round_state.media_item, spec)
        round_state.stage_index = next_index
        round_state.snippet_url = processed.snippet_url
        round_state.can_guess = False
        round_state.status = "playing"
        self._save_runtime_round(db, lobby.id, round_state)
        return True

    def get_state(self, db: Session, lobby_code: str, message: str | None = None) -> GameState:
        lobby = self._find_lobby(db, lobby_code)
        teams = db.query(Team).filter(Team.lobby_id == lobby.id).order_by(Team.name.asc()).all()
        players = db.query(Player).filter(Player.lobby_id == lobby.id).order_by(Player.name.asc()).all()
        mode = self._get_lobby_mode(db, lobby)

        runtime = self._runtime_rounds.get(lobby.code) or self._load_runtime_round(db, lobby)
        player_states = (
            db.query(LobbyPlayerState)
            .filter(LobbyPlayerState.lobby_id == lobby.id)
            .all()
        )
        player_ready_lookup = {player_state.player_id: player_state.ready for player_state in player_states}
        current_round = None
        if runtime:
            # Get team guesses for current round
            latest_round = self._get_latest_round_record(db, lobby.id)
            team_guesses_list = []
            if latest_round:
                team_guesses_list = (
                    db.query(LobbyRoundTeamGuessState)
                    .filter(LobbyRoundTeamGuessState.round_id == latest_round.id)
                    .all()
                )

            from app.schemas.game import TeamGuessState

            team_guesses = {
                guess.team_id: TeamGuessState(
                    team_id=guess.team_id,
                    artist_guessed=guess.artist_guessed,
                    title_guessed=guess.title_guessed,
                    artist_points=guess.artist_points,
                    title_points=guess.title_points,
                    bonus_points=guess.bonus_points,
                    total_points=guess.total_points,
                )
                for guess in team_guesses_list
            }

            current_round = RoundState(
                round_kind=runtime.round_kind,
                song_number=runtime.song_number,
                stage_index=runtime.stage_index,
                stage_duration_seconds=mode.stage_durations[runtime.stage_index],
                points_available=mode.stage_points[runtime.stage_index],
                snippet_url=runtime.snippet_url,
                can_guess=runtime.can_guess,
                status=runtime.status,
                team_guesses=team_guesses,
            )

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
                    ready=player_ready_lookup.get(p.id, False),
                )
                for p in players
            ],
            current_round=current_round,
            host_runtime_state=self._load_host_runtime_state(db, lobby.id),
            message=message,
        )

    def set_host_runtime_state(self, db: Session, lobby_code: str, state: dict) -> None:
        lobby = self._find_lobby(db, lobby_code)
        record = db.query(LobbyHostRuntimeState).filter(LobbyHostRuntimeState.lobby_id == lobby.id).first()
        payload = json.dumps(state)
        if record:
            record.payload_json = payload
        else:
            db.add(LobbyHostRuntimeState(lobby_id=lobby.id, payload_json=payload))
        db.commit()

    def _load_host_runtime_state(self, db: Session, lobby_id: str) -> dict | None:
        record = db.query(LobbyHostRuntimeState).filter(LobbyHostRuntimeState.lobby_id == lobby_id).first()
        if not record:
            return None
        try:
            parsed = json.loads(record.payload_json)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None

    def _find_lobby(self, db: Session, lobby_code: str) -> Lobby:
        lobby = db.query(Lobby).filter(Lobby.code == lobby_code).first()
        if not lobby:
            raise ValueError("Lobby not found")
        return lobby

    def _get_lobby_mode(self, db: Session, lobby: Lobby) -> GameModePreset:
        mode = self._lobby_modes.get(lobby.code)
        if mode:
            return mode

        snapshot = db.query(LobbyModeSnapshot).filter(LobbyModeSnapshot.lobby_id == lobby.id).first()
        if snapshot:
            try:
                payload = json.loads(snapshot.payload_json)
                restored = GameModePreset.from_dict(payload)
                self._lobby_modes[lobby.code] = restored
                if lobby.code not in self._runtime_rounds:
                    self._load_runtime_round(db, lobby)
                return restored
            except Exception:
                pass

        try:
            resolved = self.mode_service.resolve(lobby.mode_key)
        except ValueError:
            # Keep legacy lobbies available even if their mode key no longer exists.
            resolved = self.mode_service.resolve("classic_audio")
        self._lobby_modes[lobby.code] = resolved
        if lobby.code not in self._runtime_rounds:
            self._load_runtime_round(db, lobby)
        return resolved

    def _load_runtime_round(self, db: Session, lobby: Lobby) -> RuntimeRound | None:
        latest_round = self._get_latest_round_record(db, lobby.id)
        if not latest_round:
            return None

        runtime_round = RuntimeRound(
            media_item=MediaItem(
                source_id=latest_round.media_source_id,
                title=latest_round.media_title,
                artist=latest_round.media_artist,
                media_path=latest_round.media_path,
            ),
            round_kind=latest_round.round_kind,
            song_number=latest_round.song_number,
            stage_index=latest_round.stage_index,
            can_guess=latest_round.can_guess,
            status=latest_round.status,
            snippet_url=latest_round.snippet_url,
        )
        self._runtime_rounds[lobby.code] = runtime_round
        return runtime_round

    def _get_latest_round_record(self, db: Session, lobby_id: str) -> LobbyRuntimeRound | None:
        return (
            db.query(LobbyRuntimeRound)
            .filter(LobbyRuntimeRound.lobby_id == lobby_id)
            .order_by(LobbyRuntimeRound.created_at.desc())
            .first()
        )

    def _save_runtime_round(self, db: Session, lobby_id: str, runtime_round: RuntimeRound) -> None:
        latest_round = self._get_latest_round_record(db, lobby_id)

        if latest_round and latest_round.song_number == runtime_round.song_number:
            latest_round.media_source_id = runtime_round.media_item.source_id
            latest_round.media_title = runtime_round.media_item.title
            latest_round.media_artist = runtime_round.media_item.artist
            latest_round.media_path = runtime_round.media_item.media_path
            latest_round.round_kind = runtime_round.round_kind
            latest_round.stage_index = runtime_round.stage_index
            latest_round.can_guess = runtime_round.can_guess
            latest_round.status = runtime_round.status
            latest_round.snippet_url = runtime_round.snippet_url
        else:
            db.add(
                LobbyRuntimeRound(
                    lobby_id=lobby_id,
                    media_source_id=runtime_round.media_item.source_id,
                    media_title=runtime_round.media_item.title,
                    media_artist=runtime_round.media_item.artist,
                    media_path=runtime_round.media_item.media_path,
                    round_kind=runtime_round.round_kind,
                    song_number=runtime_round.song_number,
                    stage_index=runtime_round.stage_index,
                    can_guess=runtime_round.can_guess,
                    status=runtime_round.status,
                    snippet_url=runtime_round.snippet_url,
                )
            )

        db.commit()

    def toggle_team_fact(
        self, db: Session, lobby_code: str, team_id: str, fact: str
    ) -> dict:
        """Toggle a team's guess for artist or title and apply scoring."""
        lobby = self._find_lobby(db, lobby_code)
        team = db.query(Team).filter(Team.id == team_id, Team.lobby_id == lobby.id).first()
        if not team:
            raise ValueError("Team not found")

        mode = self._get_lobby_mode(db, lobby)
        latest_round = self._get_latest_round_record(db, lobby.id)
        if not latest_round:
            raise ValueError("No active round")

        # Get or create guess state for this team in this round
        guess_state = (
            db.query(LobbyRoundTeamGuessState)
            .filter(
                LobbyRoundTeamGuessState.round_id == latest_round.id,
                LobbyRoundTeamGuessState.team_id == team_id,
            )
            .first()
        )

        if not guess_state:
            guess_state = LobbyRoundTeamGuessState(
                round_id=latest_round.id,
                team_id=team_id,
                artist_guessed=False,
                title_guessed=False,
                artist_points=0,
                title_points=0,
                bonus_points=0,
                total_points=0,
            )
            db.add(guess_state)
            db.flush()

        # Get points for current stage
        fact_points = mode.stage_points[latest_round.stage_index]
        bonus_points = mode.bonus_points_both

        # Toggle the fact
        if fact == "artist":
            was_selected = guess_state.artist_guessed
            guess_state.artist_guessed = not was_selected
            if not was_selected:
                guess_state.artist_points = fact_points
            else:
                guess_state.artist_points = 0
        elif fact == "title":
            was_selected = guess_state.title_guessed
            guess_state.title_guessed = not was_selected
            if not was_selected:
                guess_state.title_points = fact_points
            else:
                guess_state.title_points = 0
        else:
            raise ValueError("Fact must be 'artist' or 'title'")

        # Calculate total points and apply to team
        previous_total = guess_state.artist_points + guess_state.title_points + guess_state.bonus_points
        new_bonus = 0
        if guess_state.artist_guessed and guess_state.title_guessed:
            new_bonus = bonus_points
        guess_state.bonus_points = new_bonus

        new_total = guess_state.artist_points + guess_state.title_points + guess_state.bonus_points
        delta = new_total - previous_total
        guess_state.total_points = new_total

        # Apply score change to team
        team.score = max(0, team.score + delta)

        db.commit()

        return {
            "team_id": team_id,
            "team_name": team.name,
            "fact": fact,
            "points_delta": delta,
            "total_team_score": team.score,
            "guess_state": {
                "artist_guessed": guess_state.artist_guessed,
                "title_guessed": guess_state.title_guessed,
                "artist_points": guess_state.artist_points,
                "title_points": guess_state.title_points,
                "bonus_points": guess_state.bonus_points,
                "total_points": guess_state.total_points,
            },
        }

    def apply_wrong_guess_penalty(self, db: Session, lobby_code: str, team_id: str) -> dict:
        """Apply wrong guess penalty to a team."""
        lobby = self._find_lobby(db, lobby_code)
        team = db.query(Team).filter(Team.id == team_id, Team.lobby_id == lobby.id).first()
        if not team:
            raise ValueError("Team not found")

        mode = self._get_lobby_mode(db, lobby)
        penalty = mode.wrong_guess_penalty

        if penalty < 1:
            return {
                "team_id": team_id,
                "team_name": team.name,
                "penalty": 0,
                "total_team_score": team.score,
                "message": "Wrong-guess penalty is set to 0",
            }

        team.score = max(0, team.score - penalty)
        db.commit()

        return {
            "team_id": team_id,
            "team_name": team.name,
            "penalty": penalty,
            "total_team_score": team.score,
            "message": f"Applied {penalty} point penalty",
        }

    def reset_round_team_guesses(self, db: Session, lobby_id: str) -> None:
        """Reset all team guess states when starting a new round."""
        latest_round = self._get_latest_round_record(db, lobby_id)
        if latest_round:
            # Delete all guess states for the previous round
            db.query(LobbyRoundTeamGuessState).filter(
                LobbyRoundTeamGuessState.round_id == latest_round.id
            ).delete()
            db.commit()

    def get_team_round_guesses(self, db: Session, lobby_code: str) -> dict:
        """Get all team guesses for the current active round."""
        lobby = self._find_lobby(db, lobby_code)
        latest_round = self._get_latest_round_record(db, lobby.id)
        if not latest_round:
            return {}

        guesses = (
            db.query(LobbyRoundTeamGuessState)
            .filter(LobbyRoundTeamGuessState.round_id == latest_round.id)
            .all()
        )

        return {
            guess.team_id: {
                "artist_guessed": guess.artist_guessed,
                "title_guessed": guess.title_guessed,
                "artist_points": guess.artist_points,
                "title_points": guess.title_points,
                "bonus_points": guess.bonus_points,
                "total_points": guess.total_points,
            }
            for guess in guesses
        }
