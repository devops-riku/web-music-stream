import uuid
from sqlalchemy import String, ForeignKey, UniqueConstraint, DateTime, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import List, Optional
from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    auth_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    profile_image: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    liked_tracks: Mapped[List["LikedTrack"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.auth_id} ({self.display_name})>"


class LikedTrack(Base):
    __tablename__ = "liked_tracks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    track_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    artist: Mapped[str] = mapped_column(String, nullable=False)
    album: Mapped[str] = mapped_column(String, nullable=False)
    album_art: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    preview_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="liked_tracks")

    __table_args__ = (
        UniqueConstraint("user_id", "track_id", name="uq_user_track_like"),
    )

    def __repr__(self) -> str:
        return f"<LikedTrack {self.name} by {self.artist} (User: {self.user_id})>"


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reply_to_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True, index=True)

    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id])
    recipient: Mapped["User"] = relationship("User", foreign_keys=[recipient_id])


class AppSettings(Base):
    """Singleton — always query with .limit(1), never by id value."""
    __tablename__ = "app_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    music_source: Mapped[str] = mapped_column(String, default="soundcloud")
    yt_format: Mapped[str] = mapped_column(String, default="bestaudio/best")
    yt_cookies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    spotify_client_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    spotify_client_secret: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ConversationRead(Base):
    """Tracks when a user last read messages from a specific partner."""
    __tablename__ = "conversation_reads"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    partner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    last_read_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
