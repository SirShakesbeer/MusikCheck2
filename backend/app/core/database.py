from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings
from app.core.defaults import (
    DEFAULT_MODE_TITLE,
    DEFAULT_PLAYBACK_PROVIDER,
    DEFAULT_SNIPPET_START_OFFSETS,
    DEFAULT_TRACK_DURATION_SECONDS,
)


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def apply_schema_patches() -> None:
    inspector = inspect(engine)

    patches: dict[str, list[str]] = {
        "lobbies": [
            "ADD COLUMN expires_at DATETIME",
        ],
        "indexed_tracks": [
            "ADD COLUMN release_year INTEGER",
            "ADD COLUMN extraction_status VARCHAR(32) DEFAULT 'pending'",
            "ADD COLUMN extraction_asset_hash VARCHAR(64) DEFAULT ''",
            "ADD COLUMN extraction_frame_path VARCHAR(2048) DEFAULT ''",
            "ADD COLUMN extraction_clip_path VARCHAR(2048) DEFAULT ''",
            "ADD COLUMN extraction_error VARCHAR(1024) DEFAULT ''",
            "ADD COLUMN extraction_updated_at DATETIME",
        ],
        "active_round_states": [
            "ADD COLUMN max_stage_reached INTEGER DEFAULT 0",
            f"ADD COLUMN playback_provider VARCHAR(64) DEFAULT '{DEFAULT_PLAYBACK_PROVIDER}'",
            "ADD COLUMN playback_ref VARCHAR(2048) DEFAULT ''",
            "ADD COLUMN playback_token INTEGER DEFAULT 0",
            "ADD COLUMN buzzer_player_id VARCHAR(36) DEFAULT ''",
            "ADD COLUMN buzzer_player_name VARCHAR(64) DEFAULT ''",
            "ADD COLUMN buzzer_team_id VARCHAR(36) DEFAULT ''",
            "ADD COLUMN buzzer_team_name VARCHAR(64) DEFAULT ''",
            f"ADD COLUMN track_duration_seconds INTEGER DEFAULT {DEFAULT_TRACK_DURATION_SECONDS}",
            f"ADD COLUMN snippet_start_offsets VARCHAR(256) DEFAULT '{DEFAULT_SNIPPET_START_OFFSETS}'",
        ],
        "active_round_team_states": [
            "ADD COLUMN artist_awarded_stage INTEGER",
            "ADD COLUMN title_awarded_stage INTEGER",
            "ADD COLUMN wrong_guess_penalty_applied BOOLEAN DEFAULT FALSE",
        ],
        "lobby_runtime_states": [
            "ADD COLUMN mode_config TEXT DEFAULT ''",
            "ADD COLUMN setup_teams TEXT DEFAULT ''",
            f"ADD COLUMN setup_mode_title VARCHAR(128) DEFAULT '{DEFAULT_MODE_TITLE}'",
            "ADD COLUMN spotify_connected BOOLEAN DEFAULT FALSE",
        ],
        "teams": [
            "ADD COLUMN stop_word VARCHAR(64) DEFAULT ''",
        ],
        "lobby_sources": [
            "ADD COLUMN added_by_player_name VARCHAR(64) DEFAULT ''",
        ],
    }

    index_patches: dict[str, list[str]] = {
        "indexed_tracks": [
            "CREATE INDEX IF NOT EXISTS ix_indexed_tracks_source_release_year ON indexed_tracks (source_id, release_year)",
        ],
    }

    with engine.begin() as connection:
        for table_name, table_patches in patches.items():
            if not inspector.has_table(table_name):
                continue

            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for patch in table_patches:
                column_name = patch.split()[2]
                if column_name in existing_columns:
                    continue
                connection.execute(text(f"ALTER TABLE {table_name} {patch}"))

        for table_name, table_patches in index_patches.items():
            if not inspector.has_table(table_name):
                continue

            for patch in table_patches:
                connection.execute(text(patch))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
