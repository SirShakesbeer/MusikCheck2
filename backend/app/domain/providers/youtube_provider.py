from app.domain.providers.base import MediaItem, MediaProvider


class YouTubePlaylistProvider(MediaProvider):
    key = "youtube_playlist"

    def fetch_items(self, source: str) -> list[MediaItem]:
        return [
            MediaItem(
                source_id=f"yt:{source}",
                title="Placeholder YouTube Song",
                artist="Placeholder Artist",
            )
        ]
