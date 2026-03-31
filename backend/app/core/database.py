from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def apply_schema_patches() -> None:
    inspector = inspect(engine)

    patches: dict[str, list[str]] = {
        "active_round_states": [
            "ADD COLUMN max_stage_reached INTEGER DEFAULT 0",
            "ADD COLUMN playback_provider VARCHAR(64) DEFAULT 'local_files'",
            "ADD COLUMN playback_ref VARCHAR(2048) DEFAULT ''",
            "ADD COLUMN track_duration_seconds INTEGER DEFAULT 240",
            "ADD COLUMN snippet_start_offsets VARCHAR(256) DEFAULT '0,0,0'",
        ],
        "active_round_team_states": [
            "ADD COLUMN artist_awarded_stage INTEGER",
            "ADD COLUMN title_awarded_stage INTEGER",
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
