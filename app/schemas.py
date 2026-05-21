from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from datetime import datetime

# --- User Schemas ---
class UserBase(BaseModel):
    auth_id: str
    display_name: Optional[str] = None
    email: Optional[str] = None
    profile_image: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- Track Schemas ---
class TrackResponse(BaseModel):
    track_id: str
    name: str
    artist: str
    album: str
    album_art: Optional[str] = None
    preview_url: Optional[str] = None
    duration_ms: Optional[int] = None
    is_liked: Optional[bool] = False

# --- Liked Track Schemas ---
class LikedTrackCreate(BaseModel):
    track_id: str
    name: str
    artist: str
    album: str
    album_art: Optional[str] = None
    preview_url: Optional[str] = None
    duration_ms: Optional[int] = None

class LikedTrackResponse(BaseModel):
    id: int
    user_id: int
    track_id: str
    name: str
    artist: str
    album: str
    album_art: Optional[str] = None
    preview_url: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Message Schemas ---
class MessageCreate(BaseModel):
    recipient_username: str
    content: str
    reply_to_id: Optional[int] = None

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    sender_username: str
    recipient_username: str
    content: str
    created_at: datetime
    reply_to_id: Optional[int] = None
    reply_to_content: Optional[str] = None
    reply_to_sender: Optional[str] = None

    class Config:
        from_attributes = True

class ConversationSummary(BaseModel):
    other_user_id: int
    other_username: str
    other_display_name: Optional[str]
    other_profile_image: Optional[str]
    last_message: str
    last_message_at: datetime
    unread_count: int

# --- Auth Schemas ---
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str
    scope: str
    user: UserResponse

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class RefreshTokenResponse(BaseModel):
    access_token: str
    expires_in: int
    token_type: str
    scope: Optional[str] = None
