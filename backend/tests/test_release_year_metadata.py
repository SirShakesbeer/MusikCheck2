import unittest
from pathlib import Path
from unittest.mock import patch

from app.domain.providers.local_file_provider import extract_local_file_metadata
from app.domain.providers.spotify_provider import SpotifyPlaylistProvider
from app.domain.providers.youtube_provider import YouTubePlaylistProvider


class _FakeAudioFile:
    def __init__(self, tags):
        self.tags = tags


class ReleaseYearMetadataTests(unittest.TestCase):
    @patch("app.domain.providers.local_file_provider.MutagenFile")
    def test_local_file_metadata_reads_release_year(self, mutagen_file):
        mutagen_file.return_value = _FakeAudioFile({"TDRC": "1999"})

        title, artist, release_year = extract_local_file_metadata(Path("Artist - Song.mp3"))

        self.assertEqual(title, "Song")
        self.assertEqual(artist, "Artist")
        self.assertEqual(release_year, 1999)

    def test_spotify_release_year_helper_reads_album_date(self):
        provider = SpotifyPlaylistProvider()

        release_year = provider._extract_release_year({"release_date": "2007-11-05"})

        self.assertEqual(release_year, 2007)

    def test_youtube_published_year_helper_reads_upload_date(self):
        provider = YouTubePlaylistProvider()

        release_year = provider._published_year("2012-06-01T12:30:00Z")

        self.assertEqual(release_year, 2012)


if __name__ == "__main__":
    unittest.main()