from app.domain.game_modes.base import GameModePlugin, SnippetSpec
from app.domain.providers.base import MediaItem


class ClassicAudioMode(GameModePlugin):
    key = "classic_audio"
    display_name = "Classic Audio Guessing"

    @property
    def stage_durations(self) -> list[int]:
        return [2, 5, 8]

    @property
    def stage_points(self) -> list[int]:
        return [100, 60, 30]

    @property
    def ui_config(self) -> dict:
        return {"show_stop_button": True, "show_waveform": False, "guess_fields": ["title", "artist"]}

    def snippet_for_stage(self, media_item: MediaItem, stage_index: int) -> SnippetSpec:
        return SnippetSpec(kind="audio", duration_seconds=self.stage_durations[stage_index], random_start=True)

    def is_guess_correct(self, media_item: MediaItem, title_guess: str, artist_guess: str) -> bool:
        return (
            media_item.title.strip().lower() == title_guess.strip().lower()
            and media_item.artist.strip().lower() == artist_guess.strip().lower()
        )
