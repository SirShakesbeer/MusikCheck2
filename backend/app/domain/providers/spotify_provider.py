from app.domain.providers.base import MediaItem, MediaProvider


class SpotifyPlaylistProvider(MediaProvider):
    key = "spotify_playlist"

    def fetch_items(self, source: str) -> list[MediaItem]:
        return [
            MediaItem(
                source_id=f"sp:{source}",
                title="Placeholder Spotify Track",
                artist="Placeholder Artist",
            )
        ]
