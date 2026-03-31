import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import Base
from app.domain.models import ActiveRoundTeamState, Team
from app.services.game_engine import GameEngine
from app.services.game_mode_service import GameModePreset, RoundTypeRule
from app.services.media_processing_service import MediaProcessingService


class _StubModeService:
    def __init__(self, preset: GameModePreset):
        self._preset = preset

    def resolve(self, preset_key: str | None, mode_override: GameModePreset | None = None) -> GameModePreset:
        return mode_override or self._preset

    def pick_round_kind(self, preset: GameModePreset, song_number: int) -> str:
        return preset.round_rules[0].kind

    def mode_requires_phone_connections(self, preset: GameModePreset) -> bool:
        return False


class _StubMediaIngestionService:
    def import_from_source(self, provider_key: str, source: str):
        return []


class GameEngineScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self._old_test_mode = settings.test_mode
        settings.test_mode = True

        self.engine = create_engine("sqlite:///:memory:", future=True)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=self.engine)

        self.preset = GameModePreset(
            key="test_mode",
            name="Test Mode",
            stage_durations=[2, 5, 8],
            stage_points=[10, 6, 3],
            round_rules=[RoundTypeRule(kind="audio", every_n_songs=1)],
            bonus_points_both=2,
            wrong_guess_penalty=5,
            required_points_to_win=20,
            filters={},
        )

        mode_service = _StubModeService(self.preset)
        media_processing = MediaProcessingService()
        media_ingestion = _StubMediaIngestionService()
        self.engine_service = GameEngine(
            mode_service=mode_service,
            media_processing=media_processing,
            media_ingestion=media_ingestion,
        )

    def tearDown(self) -> None:
        settings.test_mode = self._old_test_mode

    def _setup_round(self):
        with self.SessionLocal() as db:
            lobby = self.engine_service.create_lobby(db, host_name="Host", preset_key=self.preset.key, mode_override=self.preset)
            self.engine_service.join_team(db, lobby.code, player_name="Alice", team_name="Team A")

            team = db.query(Team).filter(Team.lobby_id == lobby.id, Team.name == "Team A").first()
            assert team is not None

            self.engine_service.start_round(db, lobby.code)
            return lobby.code, team.id

    def test_toggle_fact_scoring_and_bonus(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            self.engine_service.toggle_team_fact(db, lobby_code, team_id, "artist")
            team = db.query(Team).filter(Team.id == team_id).first()
            self.assertIsNotNone(team)
            self.assertEqual(team.score, 10)

            self.engine_service.toggle_team_fact(db, lobby_code, team_id, "title")
            team = db.query(Team).filter(Team.id == team_id).first()
            self.assertIsNotNone(team)
            self.assertEqual(team.score, 22)

            self.engine_service.toggle_team_fact(db, lobby_code, team_id, "artist")
            team = db.query(Team).filter(Team.id == team_id).first()
            self.assertIsNotNone(team)
            self.assertEqual(team.score, 10)

    def test_wrong_guess_penalty_never_goes_below_zero(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            team = db.query(Team).filter(Team.id == team_id).first()
            assert team is not None
            team.score = 3
            db.commit()

            self.engine_service.apply_wrong_guess_penalty(db, lobby_code, team_id)
            team = db.query(Team).filter(Team.id == team_id).first()
            self.assertIsNotNone(team)
            self.assertEqual(team.score, 0)

    def test_start_round_clears_previous_team_round_state(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            self.engine_service.toggle_team_fact(db, lobby_code, team_id, "artist")
            rows = db.query(ActiveRoundTeamState).count()
            self.assertEqual(rows, 1)

            self.engine_service.start_round(db, lobby_code)
            rows_after = db.query(ActiveRoundTeamState).count()
            self.assertEqual(rows_after, 0)

    def test_state_includes_round_team_states(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            self.engine_service.toggle_team_fact(db, lobby_code, team_id, "artist")
            state = self.engine_service.get_state(db, lobby_code)
            self.assertEqual(len(state.round_team_states), 1)
            self.assertEqual(state.round_team_states[0].team_id, team_id)
            self.assertEqual(state.round_team_states[0].artist_points, 10)

    def test_fact_scoring_uses_highest_stage_reached(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            self.engine_service.play_stage(db, lobby_code, 2)
            self.engine_service.play_stage(db, lobby_code, 0)
            self.engine_service.toggle_team_fact(db, lobby_code, team_id, "artist")

            team = db.query(Team).filter(Team.id == team_id).first()
            self.assertIsNotNone(team)
            self.assertEqual(team.score, 3)

    def test_cannot_remove_fact_after_higher_stage_played(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            self.engine_service.toggle_team_fact(db, lobby_code, team_id, "artist")
            self.engine_service.play_stage(db, lobby_code, 1)

            with self.assertRaises(ValueError):
                self.engine_service.toggle_team_fact(db, lobby_code, team_id, "artist")

            team = db.query(Team).filter(Team.id == team_id).first()
            self.assertIsNotNone(team)
            self.assertEqual(team.score, 10)

            self.engine_service.toggle_team_fact(db, lobby_code, team_id, "title")
            team = db.query(Team).filter(Team.id == team_id).first()
            self.assertIsNotNone(team)
            self.assertEqual(team.score, 18)


if __name__ == "__main__":
    unittest.main()
