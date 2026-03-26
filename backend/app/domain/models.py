import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
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
    runtime_rounds: Mapped[list["LobbyRuntimeRound"]] = relationship(
        back_populates="lobby",
        cascade="all, delete-orphan",
    )
    player_states: Mapped[list["LobbyPlayerState"]] = relationship(
        back_populates="lobby",
        cascade="all, delete-orphan",
    )
    mode_snapshot: Mapped["LobbyModeSnapshot | None"] = relationship(
        back_populates="lobby",
        cascade="all, delete-orphan",
        uselist=False,
    )
    host_runtime_state: Mapped["LobbyHostRuntimeState | None"] = relationship(
        back_populates="lobby",
        cascade="all, delete-orphan",
        uselist=False,
    )


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
    runtime_state: Mapped["LobbyPlayerState"] = relationship(back_populates="player", uselist=False)


class LobbyPlayerState(Base):
    __tablename__ = "lobby_player_states"
    __table_args__ = (UniqueConstraint("lobby_id", "player_id", name="uq_lobby_player_state"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lobby_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobbies.id"), index=True)
    player_id: Mapped[str] = mapped_column(String(36), ForeignKey("players.id"), index=True)
    ready: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lobby: Mapped[Lobby] = relationship(back_populates="player_states")
    player: Mapped[Player] = relationship(back_populates="runtime_state")


class LobbyModeSnapshot(Base):
    __tablename__ = "lobby_mode_snapshots"
    __table_args__ = (UniqueConstraint("lobby_id", name="uq_lobby_mode_snapshot_lobby"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lobby_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobbies.id"), index=True)
    mode_key: Mapped[str] = mapped_column(String(64))
    payload_json: Mapped[str] = mapped_column(String(16384))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lobby: Mapped[Lobby] = relationship(back_populates="mode_snapshot")


class LobbyHostRuntimeState(Base):
    __tablename__ = "lobby_host_runtime_states"
    __table_args__ = (UniqueConstraint("lobby_id", name="uq_lobby_host_runtime_state_lobby"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lobby_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobbies.id"), index=True)
    payload_json: Mapped[str] = mapped_column(String(65535))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lobby: Mapped[Lobby] = relationship(back_populates="host_runtime_state")


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


class LobbyRuntimeRound(Base):
    __tablename__ = "lobby_runtime_rounds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lobby_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobbies.id"), index=True)
    media_source_id: Mapped[str] = mapped_column(String(256))
    media_title: Mapped[str] = mapped_column(String(256))
    media_artist: Mapped[str] = mapped_column(String(256))
    media_path: Mapped[str] = mapped_column(String(2048))
    round_kind: Mapped[str] = mapped_column(String(32))
    song_number: Mapped[int] = mapped_column(Integer)
    stage_index: Mapped[int] = mapped_column(Integer, default=0)
    can_guess: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(128), default="playing")
    snippet_url: Mapped[str] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lobby: Mapped[Lobby] = relationship(back_populates="runtime_rounds")
    team_guesses: Mapped[list["LobbyRoundTeamGuessState"]] = relationship(
        back_populates="round",
        cascade="all, delete-orphan",
    )


class LobbyRoundTeamGuessState(Base):
    __tablename__ = "lobby_round_team_guess_states"
    __table_args__ = (
        UniqueConstraint(
            "round_id",
            "team_id",
            name="uq_round_team_guess_state",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    round_id: Mapped[str] = mapped_column(String(36), ForeignKey("lobby_runtime_rounds.id"), index=True)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), index=True)
    artist_guessed: Mapped[bool] = mapped_column(Boolean, default=False)
    title_guessed: Mapped[bool] = mapped_column(Boolean, default=False)
    artist_points: Mapped[int] = mapped_column(Integer, default=0)
    title_points: Mapped[int] = mapped_column(Integer, default=0)
    bonus_points: Mapped[int] = mapped_column(Integer, default=0)
    total_points: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    round: Mapped[LobbyRuntimeRound] = relationship(back_populates="team_guesses")
