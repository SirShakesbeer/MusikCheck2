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

    def test_winner_lock_blocks_additional_positive_fact_changes(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            team = db.query(Team).filter(Team.id == team_id).first()
            assert team is not None
            team.score = 20
            db.commit()

            with self.assertRaises(ValueError):
                self.engine_service.toggle_team_fact(db, lobby_code, team_id, "artist")

    def test_winner_lock_blocks_start_round_until_score_is_reduced(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            team = db.query(Team).filter(Team.id == team_id).first()
            assert team is not None
            team.score = 20
            db.commit()

            with self.assertRaises(ValueError):
                self.engine_service.start_round(db, lobby_code)

            self.engine_service.apply_wrong_guess_penalty(db, lobby_code, team_id)
            self.engine_service.start_round(db, lobby_code)

            state = self.engine_service.get_state(db, lobby_code)
            self.assertFalse(state.has_winner_lock)

    def test_state_exposes_winner_lock_metadata(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            team = db.query(Team).filter(Team.id == team_id).first()
            assert team is not None
            team.score = 21
            db.commit()

            state = self.engine_service.get_state(db, lobby_code)
            self.assertTrue(state.has_winner_lock)
            self.assertIn(team_id, state.winner_team_ids)

    def test_finish_game_stats_requires_winner_lock(self) -> None:
        lobby_code, _ = self._setup_round()

        with self.SessionLocal() as db:
            with self.assertRaises(ValueError):
                self.engine_service.get_finish_game_stats(db, lobby_code)

    def test_finish_game_stats_returns_ranked_payload(self) -> None:
        with self.SessionLocal() as db:
            lobby = self.engine_service.create_lobby(
                db,
                host_name="Host",
                preset_key=self.preset.key,
                mode_override=self.preset,
            )
            self.engine_service.join_team(db, lobby.code, player_name="Alice", team_name="Team A")
            self.engine_service.join_team(db, lobby.code, player_name="Bob", team_name="Team B")

            team_a = db.query(Team).filter(Team.lobby_id == lobby.id, Team.name == "Team A").first()
            team_b = db.query(Team).filter(Team.lobby_id == lobby.id, Team.name == "Team B").first()
            assert team_a is not None
            assert team_b is not None

            team_a.score = 22
            team_b.score = 14
            db.commit()

            stats = self.engine_service.get_finish_game_stats(db, lobby.code)

            self.assertEqual(stats.lobby_code, lobby.code)
            self.assertEqual(stats.required_points_to_win, 20)
            self.assertEqual(stats.total_songs_played, 0)
            self.assertEqual(stats.top_score, 22)
            self.assertEqual(stats.total_points_awarded, 36)
            self.assertEqual(stats.total_players, 2)
            self.assertEqual(stats.winner_team_names, ["Team A"])
            self.assertEqual(len(stats.teams), 2)
            self.assertEqual(stats.teams[0].team_name, "Team A")
            self.assertEqual(stats.teams[0].rank, 1)
            self.assertTrue(stats.teams[0].is_winner)
            self.assertEqual(stats.teams[1].team_name, "Team B")
            self.assertEqual(stats.teams[1].rank, 2)
            self.assertFalse(stats.teams[1].is_winner)

    def test_reset_game_clears_scores_and_round_progress(self) -> None:
        lobby_code, team_id = self._setup_round()

        with self.SessionLocal() as db:
            self.engine_service.toggle_team_fact(db, lobby_code, team_id, "artist")
            self.engine_service.finish_round(db, lobby_code)

            state_before = self.engine_service.get_state(db, lobby_code)
            self.assertIsNotNone(state_before.current_round)
            self.assertGreaterEqual(state_before.current_round.song_number, 1)
            self.assertGreaterEqual(state_before.teams[0].score, 1)

            self.engine_service.reset_game(db, lobby_code)

            state_after = self.engine_service.get_state(db, lobby_code)
            self.assertIsNone(state_after.current_round)
            self.assertEqual(state_after.round_team_states, [])
            self.assertFalse(state_after.has_winner_lock)
            for team in state_after.teams:
                self.assertEqual(team.score, 0)

            stats = self.engine_service.get_finish_game_stats
            with self.assertRaises(ValueError):
                stats(db, lobby_code)


if __name__ == "__main__":
    unittest.main()
