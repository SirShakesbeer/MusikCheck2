from pathlib import Path
from datetime import datetime
from urllib.parse import parse_qs, urlparse

from sqlalchemy.orm import Session

from app.core.config import settings
from app.domain.providers.base import MediaItem
from app.domain.providers.local_file_provider import extract_local_file_metadata
from app.domain.models import IndexedTrack, MediaSource
from app.domain.snippets import SnippetSpec
from app.services.media_extraction_service import MediaExtractionService

AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".ogg"}


class MediaLibraryService:
    def __init__(self, extraction_service: MediaExtractionService | None = None) -> None:
        self._extraction_service = extraction_service or MediaExtractionService()

    def register_source(self, db: Session, provider_key: str, source_value: str) -> MediaSource:
        source = (
            db.query(MediaSource)
            .filter(MediaSource.provider_key == provider_key)
            .filter(MediaSource.source_value == source_value)
            .first()
        )
        if source:
            return source

        source = MediaSource(provider_key=provider_key, source_value=source_value)
        db.add(source)
        db.commit()
        db.refresh(source)
        return source

    def register_local_source(self, db: Session, folder_path: str) -> MediaSource:
        return self.register_source(db, "local_files", folder_path)

    def list_sources(self, db: Session) -> list[MediaSource]:
        return db.query(MediaSource).order_by(MediaSource.created_at.desc()).all()

    def get_source(self, db: Session, source_id: str) -> MediaSource | None:
        return db.query(MediaSource).filter(MediaSource.id == source_id).first()

    def delete_source(self, db: Session, source_id: str) -> bool:
        source = db.query(MediaSource).filter(MediaSource.id == source_id).first()
        if not source:
            return False

        db.delete(source)
        db.commit()
        return True

    def cleanup_sources(self, db: Session, source_ids: list[str]) -> list[str]:
        removed_source_ids: list[str] = []
        for source_id in source_ids:
            if self.delete_source(db, source_id):
                removed_source_ids.append(source_id)
        return removed_source_ids

    def index_local_source(self, db: Session, source_id: str) -> int:
        source = db.query(MediaSource).filter(MediaSource.id == source_id).first()
        if not source:
            raise ValueError("Source not found")

        root = Path(source.source_value)
        if not root.exists() or not root.is_dir():
            raise ValueError("Local folder does not exist")

        indexed_count = 0
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
                continue

            stat = path.stat()
            file_path = str(path)
            title, artist, release_year = extract_local_file_metadata(path)

            existing = db.query(IndexedTrack).filter(IndexedTrack.file_path == file_path).first()
            if existing:
                if existing.file_mtime == int(stat.st_mtime) and existing.file_size == int(stat.st_size):
                    self._ensure_local_extraction(existing, path, title, artist)
                    continue
                existing.title = title
                existing.artist = artist
                existing.release_year = release_year
                existing.file_mtime = int(stat.st_mtime)
                existing.file_size = int(stat.st_size)
                existing.source_id = source.id
                self._ensure_local_extraction(existing, path, title, artist)
            else:
                indexed_track = IndexedTrack(
                    source_id=source.id,
                    file_path=file_path,
                    title=title,
                    artist=artist,
                    release_year=release_year,
                    file_mtime=int(stat.st_mtime),
                    file_size=int(stat.st_size),
                )
                self._ensure_local_extraction(indexed_track, path, title, artist)
                db.add(indexed_track)
            indexed_count += 1

        db.commit()
        return indexed_count

    def refresh_local_extractions(self, db: Session, source_id: str | None = None, limit: int | None = None) -> int:
        query = db.query(IndexedTrack, MediaSource).join(MediaSource, IndexedTrack.source_id == MediaSource.id)
        if source_id:
            query = query.filter(IndexedTrack.source_id == source_id)

        rows = query.order_by(IndexedTrack.updated_at.desc())
        if limit is not None:
            rows = rows.limit(max(1, limit))

        refreshed = 0
        for track, source in rows.all():
            if source.provider_key != "local_files":
                continue
            path = Path(track.file_path)
            if not path.exists():
                continue
            title, artist, _ = extract_local_file_metadata(path)
            track.title = title
            track.artist = artist
            self._ensure_local_extraction(track, path, title, artist, force=True)
            refreshed += 1

        db.commit()
        return refreshed

    def _ensure_local_extraction(
        self,
        track: IndexedTrack,
        path: Path,
        title: str,
        artist: str,
        force: bool = False,
    ) -> None:
        if not settings.extraction_enabled:
            track.extraction_status = "disabled"
            return

        spec = SnippetSpec(kind="local", duration_seconds=12, random_start=False)
        asset_hash = self._extraction_service.build_cache_key(
            MediaItem(source_id=track.id, title=title, artist=artist, media_path=str(path)),
            spec,
        )
        if not force and track.extraction_asset_hash == asset_hash and track.extraction_status == "ready":
            return

        snippet_url = self._extraction_service.build_local_snippet(
            MediaItem(source_id=track.id, title=title, artist=artist, media_path=str(path)),
            spec,
            asset_hash,
        )
        if snippet_url and snippet_url.startswith("/api/media/snippets/"):
            snippet_path = self._extraction_service.resolve_snippet_path(asset_hash)
            track.extraction_status = "ready"
            track.extraction_asset_hash = asset_hash
            track.extraction_frame_path = snippet_path.as_posix() if snippet_path else ""
            track.extraction_clip_path = track.extraction_frame_path
            track.extraction_error = ""
            track.extraction_updated_at = datetime.utcnow()
        else:
            track.extraction_status = "fallback"
            track.extraction_asset_hash = asset_hash
            track.extraction_error = "Using stream fallback"

    def get_source_track_count(self, db: Session, source_id: str) -> int:
        return db.query(IndexedTrack).filter(IndexedTrack.source_id == source_id).count()

    def list_indexed_tracks(
        self,
        db: Session,
        source_ids: list[str] | None = None,
        limit: int = 500,
    ) -> list[tuple[IndexedTrack, MediaSource]]:
        query = db.query(IndexedTrack, MediaSource).join(MediaSource, IndexedTrack.source_id == MediaSource.id)
        if source_ids:
            query = query.filter(IndexedTrack.source_id.in_(source_ids))

        return query.order_by(IndexedTrack.updated_at.desc()).limit(limit).all()

    def get_indexed_track(self, db: Session, track_id: str) -> tuple[IndexedTrack, MediaSource] | None:
        row = (
            db.query(IndexedTrack, MediaSource)
            .join(MediaSource, IndexedTrack.source_id == MediaSource.id)
            .filter(IndexedTrack.id == track_id)
            .first()
        )
        return row

    def sync_remote_source(self, db: Session, source_id: str, items: list[MediaItem]) -> int:
        source = db.query(MediaSource).filter(MediaSource.id == source_id).first()
        if not source:
            raise ValueError("Source not found")

        changed_count = 0
        seen_keys = set()
        for item in items:
            external_track_key = item.media_path or item.source_id
            if source.provider_key == "youtube_playlist" and item.media_path:
                parsed = urlparse(item.media_path)
                values = parse_qs(parsed.query).get("v")
                if values:
                    external_track_key = values[0]
            elif source.provider_key == "spotify_playlist":
                parts = [segment for segment in item.source_id.split(":") if segment]
                if parts:
                    external_track_key = parts[-1]

            if external_track_key in seen_keys:
                continue
            seen_keys.add(external_track_key)

            duration_seconds = max(0, int(item.duration_seconds or 0))
            duration_ms = duration_seconds * 1000

            existing = (
                db.query(IndexedTrack)
                .filter(IndexedTrack.file_path == external_track_key)
                .first()
            )
            if existing:
                was_changed = False

                if existing.source_id != source.id:
                    existing.source_id = source.id
                    was_changed = True

                if existing.title != item.title:
                    existing.title = item.title
                    was_changed = True

                if existing.artist != item.artist:
                    existing.artist = item.artist
                    was_changed = True

                if existing.release_year != item.release_year:
                    existing.release_year = item.release_year
                    was_changed = True

                if duration_ms > 0 and existing.file_size != duration_ms:
                    existing.file_size = duration_ms
                    was_changed = True

                if existing.extraction_status != "unsupported":
                    pass

                if not was_changed:
                    continue
            else:
                db.add(
                    IndexedTrack(
                        source_id=source.id,
                        file_path=external_track_key,
                        title=item.title,
                        artist=item.artist,
                        release_year=item.release_year,
                        file_mtime=0,
                        file_size=duration_ms,
                    )
                )
            changed_count += 1

        db.commit()
        return changed_count
