import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
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
