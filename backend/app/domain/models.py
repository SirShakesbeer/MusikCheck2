import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Lobby(Base):
    __tablename__ = "lobbies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    host_name: Mapped[str] = mapped_column(String(64))
    mode_key: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    teams: Mapped[list["Team"]] = relationship(back_populates="lobby", cascade="all, delete-orphan")
    players: Mapped[list["Player"]] = relationship(back_populates="lobby", cascade="all, delete-orphan")


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lobby_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobbies.id"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    score: Mapped[int] = mapped_column(Integer, default=0)

    lobby: Mapped[Lobby] = relationship(back_populates="teams")
    players: Mapped[list["Player"]] = relationship(back_populates="team")


class Player(Base):
    __tablename__ = "players"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lobby_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobbies.id"), index=True)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(64))

    lobby: Mapped[Lobby] = relationship(back_populates="players")
    team: Mapped["Team"] = relationship(back_populates="players")


class LobbyRuntimeState(Base):
    __tablename__ = "lobby_runtime_states"

    lobby_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobbies.id"), primary_key=True)
    song_number: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PlayerRuntimeState(Base):
    __tablename__ = "player_runtime_states"

    player_id: Mapped[str] = mapped_column(String(36), ForeignKey("players.id"), primary_key=True)
    lobby_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobbies.id"), index=True)
    ready: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ActiveRoundState(Base):
    __tablename__ = "active_round_states"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lobby_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobbies.id"), unique=True, index=True)
    media_source_id: Mapped[str] = mapped_column(String(128))
    media_title: Mapped[str] = mapped_column(String(256))
    media_artist: Mapped[str] = mapped_column(String(256))
    media_path: Mapped[str] = mapped_column(String(2048))
    round_kind: Mapped[str] = mapped_column(String(64))
    song_number: Mapped[int] = mapped_column(Integer)
    stage_index: Mapped[int] = mapped_column(Integer, default=0)
    max_stage_reached: Mapped[int] = mapped_column(Integer, default=0)
    can_guess: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(64), default="playing")
    snippet_url: Mapped[str] = mapped_column(String(2048))
    playback_provider: Mapped[str] = mapped_column(String(64), default="local_files")
    playback_ref: Mapped[str] = mapped_column(String(2048), default="")
    track_duration_seconds: Mapped[int] = mapped_column(Integer, default=240)
    snippet_start_offsets: Mapped[str] = mapped_column(String(256), default="0,0,0")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ActiveRoundTeamState(Base):
    __tablename__ = "active_round_team_states"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    active_round_id: Mapped[str] = mapped_column(String(36), ForeignKey("active_round_states.id"), index=True)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), index=True)
    artist_points: Mapped[int] = mapped_column(Integer, default=0)
    title_points: Mapped[int] = mapped_column(Integer, default=0)
    bonus_points: Mapped[int] = mapped_column(Integer, default=0)
    artist_awarded_stage: Mapped[int] = mapped_column(Integer, nullable=True, default=None)
    title_awarded_stage: Mapped[int] = mapped_column(Integer, nullable=True, default=None)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MediaSource(Base):
    __tablename__ = "media_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_key: Mapped[str] = mapped_column(String(64), index=True)
    source_value: Mapped[str] = mapped_column(String(1024), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tracks: Mapped[list["IndexedTrack"]] = relationship(back_populates="source", cascade="all, delete-orphan")


class IndexedTrack(Base):
    __tablename__ = "indexed_tracks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_id: Mapped[str] = mapped_column(String(36), ForeignKey("media_sources.id"), index=True)
    file_path: Mapped[str] = mapped_column(String(2048), unique=True)
    title: Mapped[str] = mapped_column(String(256))
    artist: Mapped[str] = mapped_column(String(256), default="Unknown Artist")
    file_mtime: Mapped[int] = mapped_column(Integer)
    file_size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source: Mapped[MediaSource] = relationship(back_populates="tracks")
