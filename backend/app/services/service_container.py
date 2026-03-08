from app.domain.game_modes.classic_audio import ClassicAudioMode
from app.domain.providers.local_file_provider import LocalFileProvider
from app.domain.providers.spotify_provider import SpotifyPlaylistProvider
from app.domain.providers.text_list_provider import TextListProvider
from app.domain.providers.youtube_provider import YouTubePlaylistProvider
from app.services.game_engine import GameEngine
from app.services.game_mode_registry import GameModeRegistry
from app.services.media_ingestion_service import MediaIngestionService
from app.services.media_processing_service import MediaProcessingService


media_ingestion_service = MediaIngestionService(
    providers=[
        LocalFileProvider(),
        TextListProvider(),
        YouTubePlaylistProvider(),
        SpotifyPlaylistProvider(),
    ]
)
media_processing_service = MediaProcessingService()
game_mode_registry = GameModeRegistry([ClassicAudioMode()])
game_engine = GameEngine(mode_registry=game_mode_registry, media_processing=media_processing_service)
