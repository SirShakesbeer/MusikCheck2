import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.services.game_mode_service import GameModePreset, GameModeService, RoundTypeRule


class RoundTypeMetadataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_round_types_endpoint_lists_supported_types(self) -> None:
        response = self.client.get('/api/round-types')
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertTrue(payload['ok'])
        round_types = payload['data']['round_types']

        self.assertGreaterEqual(len(round_types), 1)
        self.assertEqual([item['kind'] for item in round_types], ['audio', 'video', 'lyrics'])
        self.assertEqual(round_types[0]['label'], 'Audio rounds')
        self.assertTrue(any(item['requires_phone_connections'] for item in round_types))

    def test_unknown_round_kind_is_rejected(self) -> None:
        service = GameModeService()

        with self.assertRaises(ValueError):
            service.build_custom_mode(
                name='Broken Mode',
                stage_durations=[1, 2, 3],
                stage_points=[3, 2, 1],
                round_rules=[RoundTypeRule(kind='dance', every_n_songs=1)],
                bonus_points_both=1,
                wrong_guess_penalty=0,
                required_points_to_win=10,
                filters={},
            )
