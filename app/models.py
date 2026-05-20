from sqlalchemy import String, ForeignKey, UniqueConstraint, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import List, Optional
from app.db import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    auth_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    profile_image: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    liked_tracks: Mapped[List["LikedTrack"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.auth_id} ({self.display_name})>"

class LikedTrack(Base):
    __tablename__ = "liked_tracks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    track_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    artist: Mapped[str] = mapped_column(String, nullable=False)
    album: Mapped[str] = mapped_column(String, nullable=False)
    album_art: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    preview_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="liked_tracks")

    # Constraints
    __table_args__ = (
        UniqueConstraint("user_id", "track_id", name="uq_user_track_like"),
    )

    def __repr__(self) -> str:
        return f"<LikedTrack {self.name} by {self.artist} (User: {self.user_id})>"


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id])
    recipient: Mapped["User"] = relationship("User", foreign_keys=[recipient_id])
