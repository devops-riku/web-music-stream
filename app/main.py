from fastapi import FastAPI, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import or_, and_, func, select
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
from pydantic import BaseModel
import asyncio
import json
import uuid
import httpx
import secrets
from datetime import datetime, timezone


def _json_serial(obj):
    """JSON serializer that handles uuid.UUID and datetime objects."""
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object {obj!r} is not JSON serializable")

def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_last_read(db: Session, user_id: int, partner_id: int):
    cr = db.get(ConversationRead, (user_id, partner_id))
    return cr.last_read_at if cr else None


def _upsert_last_read(db: Session, user_id: int, partner_id: int) -> None:
    cr = db.get(ConversationRead, (user_id, partner_id))
    if cr:
        cr.last_read_at = datetime.utcnow()
    else:
        db.add(ConversationRead(user_id=user_id, partner_id=partner_id, last_read_at=datetime.utcnow()))
    db.commit()

from app.config import settings
from app.db import Base, engine, get_db
from app.models import User, LikedTrack, Message, ConversationRead, AppSettings
from app.schemas import (
    TrackResponse,
    LikedTrackCreate,
    LikedTrackResponse,
    UserResponse,
    MessageCreate,
    MessageResponse,
    ConversationSummary,
    SettingsResponse,
    SettingsUpdate,
)
from app.soundcloud import soundcloud_api
from app.ytmusic import ytmusic_api, _enrich_with_itunes
from app.spotify import spotify_search, spotify_trending, spotify_get_stream_url
from app.settings_service import get_config, invalidate as invalidate_config
from app.stream_cache import get_cached_url, cache_url
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_or_guest,
    get_current_user
)

try:
    Base.metadata.create_all(bind=engine)
except Exception:
    pass

# ─── WebSocket Connection Manager ────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: Dict[uuid.UUID, list] = {}

    async def connect(self, user_id: uuid.UUID, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: uuid.UUID, ws: WebSocket):
        conns = self.active.get(user_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self.active.pop(user_id, None)

    async def send_to_user(self, user_id: uuid.UUID, data: dict):
        text = json.dumps(data, default=_json_serial)
        for ws in self.active.get(user_id, []):
            try:
                await ws.send_text(text)
            except Exception:
                pass

    async def broadcast_status(self, username: str, online: bool):
        payload = json.dumps(
            {"type": "user_status", "username": username, "online": online},
            default=_json_serial,
        )
        for conns in list(self.active.values()):
            for ws in conns:
                try:
                    await ws.send_text(payload)
                except Exception:
                    pass

manager = ConnectionManager()

# ─── Jam Room State & Manager ─────────────────────────────────────────────────

jam_rooms: Dict[str, dict] = {}  # room_id -> room state

class JamManager:
    def __init__(self):
        self.rooms: Dict[str, Dict[int, list]] = {}  # room_id -> {user_id -> [ws]}

    async def connect(self, room_id: str, user_id: int, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_id, {}).setdefault(user_id, []).append(ws)

    def disconnect(self, room_id: str, user_id: int, ws: WebSocket):
        conns = self.rooms.get(room_id, {}).get(user_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self.rooms.get(room_id, {}).pop(user_id, None)
        if not self.rooms.get(room_id):
            self.rooms.pop(room_id, None)

    def member_count(self, room_id: str) -> int:
        return len(self.rooms.get(room_id, {}))

    async def broadcast(self, room_id: str, data: dict, exclude_user_id: int = None):
        for uid, conns in list(self.rooms.get(room_id, {}).items()):
            if uid == exclude_user_id:
                continue
            for ws in conns:
                try:
                    await ws.send_text(json.dumps(data))
                except Exception:
                    pass

jam_manager = JamManager()

app = FastAPI(
    title="Rikupy Music Streaming API",
    description="Backend API for Rikupy - YouTube Music powered streaming app",
    version="2.0.0"
)
print(settings.cors_origins_list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth Schemas ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""

class LoginRequest(BaseModel):
    username: str
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ─── Root ────────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "Melodix API is running!", "docs_url": "/docs"}

# ─── Auth Endpoints ──────────────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=AuthResponse)
async def register(body: RegisterRequest, db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    if not username or not body.password:
        raise HTTPException(status_code=400, detail="Username and password are required.")

    existing = db.scalar(select(User).where(User.auth_id == username))
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken.")

    display = body.display_name.strip() or username
    avatar_url = f"https://ui-avatars.com/api/?name={display.replace(' ', '+')}&background=7c3aed&color=fff"

    new_user = User(
        auth_id=username,
        display_name=display,
        password_hash=hash_password(body.password),
        profile_image=avatar_url
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({"sub": new_user.auth_id})
    return AuthResponse(
        access_token=token,
        user=UserResponse.model_validate(new_user)
    )


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    user = db.scalar(select(User).where(User.auth_id == username))

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_access_token({"sub": user.auth_id})
    return AuthResponse(
        access_token=token,
        user=UserResponse.model_validate(user)
    )

# ─── User Profile ────────────────────────────────────────────────────────────

@app.get("/api/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user_or_guest)):
    return current_user

# ─── Home / Trending ─────────────────────────────────────────────────────────

async def _fetch_tracks(source: str, mode: str, q: str, limit: int, cfg) -> List[dict]:
    """Dispatch search/trending to the configured source."""
    import asyncio
    loop = asyncio.get_event_loop()
    if source == "youtube":
        if mode == "trending":
            return ytmusic_api.get_trending(limit)
        return ytmusic_api.search(q, limit)
    if source == "spotify":
        if not (cfg.spotify_client_id and cfg.spotify_client_secret):
            raise HTTPException(status_code=400, detail="Spotify credentials not configured.")
        if mode == "trending":
            return await loop.run_in_executor(
                None, spotify_trending, limit, cfg.spotify_client_id, cfg.spotify_client_secret
            )
        return await loop.run_in_executor(
            None, spotify_search, q, limit, cfg.spotify_client_id, cfg.spotify_client_secret
        )
    # default: soundcloud
    if mode == "trending":
        return await soundcloud_api.get_trending(limit)
    return await soundcloud_api.search(q, limit)


@app.get("/api/home", response_model=List[TrackResponse])
async def get_home_tracks(
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_guest)
):
    try:
        cfg = get_config(db)
        tracks = await _fetch_tracks(cfg.music_source, "trending", "", limit, cfg)
        if cfg.music_source != "spotify":
            tracks = await _enrich_with_itunes(tracks)

        track_ids = [t["track_id"] for t in tracks]
        if track_ids:
            stmt = select(LikedTrack.track_id).where(
                LikedTrack.user_id == current_user.id,
                LikedTrack.track_id.in_(track_ids)
            )
            local_liked_ids = set(db.scalars(stmt).all())
            for track in tracks:
                track["is_liked"] = track["track_id"] in local_liked_ids

        return tracks
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch home tracks: {str(e)}")

# ─── Search ──────────────────────────────────────────────────────────────────

@app.get("/api/search", response_model=List[TrackResponse])
async def search_tracks(
    q: str = Query(..., description="Search query string"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_guest)
):
    try:
        cfg = get_config(db)
        tracks = await _fetch_tracks(cfg.music_source, "search", q, offset + limit, cfg)
        tracks = tracks[offset:offset + limit]
        if cfg.music_source != "spotify":
            tracks = await _enrich_with_itunes(tracks)

        track_ids = [t["track_id"] for t in tracks]
        if track_ids:
            stmt = select(LikedTrack.track_id).where(
                LikedTrack.user_id == current_user.id,
                LikedTrack.track_id.in_(track_ids)
            )
            local_liked_ids = set(db.scalars(stmt).all())
            for track in tracks:
                track["is_liked"] = track["track_id"] in local_liked_ids

        return tracks
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# ─── Like / Unlike ───────────────────────────────────────────────────────────

@app.post("/api/tracks/like", response_model=LikedTrackResponse)
async def like_track(
    track_info: LikedTrackCreate,
    current_user: User = Depends(get_current_user_or_guest),
    db: Session = Depends(get_db)
):
    existing_like = db.scalar(
        select(LikedTrack).where(
            LikedTrack.user_id == current_user.id,
            LikedTrack.track_id == track_info.track_id
        )
    )
    if existing_like:
        return existing_like

    new_like = LikedTrack(
        user_id=current_user.id,
        track_id=track_info.track_id,
        name=track_info.name,
        artist=track_info.artist,
        album=track_info.album,
        album_art=track_info.album_art,
        preview_url=track_info.preview_url,
        duration_ms=track_info.duration_ms
    )
    db.add(new_like)
    db.commit()
    db.refresh(new_like)
    return new_like


@app.delete("/api/tracks/like")
async def unlike_track(
    track_id: str = Query(..., description="Track ID to unlike"),
    current_user: User = Depends(get_current_user_or_guest),
    db: Session = Depends(get_db)
):
    existing_like = db.scalar(
        select(LikedTrack).where(
            LikedTrack.user_id == current_user.id,
            LikedTrack.track_id == track_id
        )
    )
    if not existing_like:
        return {"message": "Track was not liked."}

    db.delete(existing_like)
    db.commit()
    return {"message": "Track successfully unliked."}


@app.get("/api/tracks/likes", response_model=List[LikedTrackResponse])
async def get_liked_tracks(
    current_user: User = Depends(get_current_user_or_guest),
    db: Session = Depends(get_db)
):
    stmt = select(LikedTrack).where(LikedTrack.user_id == current_user.id).order_by(LikedTrack.created_at.desc())
    return db.scalars(stmt).all()

# ─── Streaming ───────────────────────────────────────────────────────────────

async def _resolve_url(id: str, db) -> Optional[str]:
    """Route stream resolution based on track_id format (no cache — used for SoundCloud only)."""
    cfg = get_config(db)
    if id.startswith("http"):
        return await soundcloud_api.get_stream_url(id)
    if id.startswith("spotify|"):
        return await spotify_get_stream_url(id, cfg.yt_format, cfg.yt_cookies)
    return await ytmusic_api.get_stream_url(id, cfg.yt_format, cfg.yt_cookies)


async def _resolve_raw_url(id: str, db) -> Optional[str]:
    """Resolve with in-memory cache. Used by the proxy stream endpoint."""
    cached = get_cached_url(id)
    if cached:
        return cached
    url = await _resolve_url(id, db)
    if url:
        cache_url(id, url)
    return url


@app.get("/api/player/resolve")
async def resolve_stream(id: str = Query(...), db: Session = Depends(get_db)):
    """Return a direct URL only for SoundCloud (CDN URLs are safe to expose).
    For YouTube / Spotify callers should use /api/player/stream instead."""
    if id.startswith("http"):
        url = await soundcloud_api.get_stream_url(id)
    else:
        # Return proxy URL so the browser never sees a raw YouTube/Spotify URL
        url = f"/api/player/stream?id={id}"
    if not url:
        raise HTTPException(status_code=404, detail="Could not resolve stream URL.")
    return {"url": url}


@app.get("/api/player/stream")
async def proxy_stream(request: Request, id: str = Query(...), db: Session = Depends(get_db)):
    """Proxy audio through the backend. Raw upstream URL is never exposed to the browser."""
    url = await _resolve_raw_url(id, db)
    if not url:
        raise HTTPException(status_code=404, detail="Could not extract stream URL.")

    req_headers = {}
    if "range" in request.headers:
        req_headers["Range"] = request.headers["range"]

    # read=None allows the stream to stay open as long as needed
    timeout = httpx.Timeout(connect=15.0, read=None, write=None, pool=None)
    client = httpx.AsyncClient(follow_redirects=True, timeout=timeout)
    upstream = await client.send(
        httpx.Request("GET", url, headers=req_headers),
        stream=True,
    )

    resp_headers = {"Accept-Ranges": "bytes"}
    for h in ("content-type", "content-length", "content-range"):
        if h in upstream.headers:
            resp_headers[h] = upstream.headers[h]

    async def generate():
        try:
            async for chunk in upstream.aiter_bytes(16384):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(generate(), status_code=upstream.status_code, headers=resp_headers)


# ─── Jam Rooms ───────────────────────────────────────────────────────────────

@app.post("/api/jam")
async def create_jam(current_user: User = Depends(get_current_user)):
    room_id = secrets.token_urlsafe(6)
    jam_rooms[room_id] = {
        "room_id": room_id,
        "host_id": current_user.id,
        "host_username": current_user.auth_id,
        "track": None,
        "is_playing": False,
        "position_ms": 0,
        "started_at": None,  # UTC ISO when current playback started at position_ms
        "updated_at": utcnow(),
    }
    return jam_rooms[room_id]


@app.get("/api/jam/{room_id}")
async def get_jam(room_id: str):
    if room_id not in jam_rooms:
        raise HTTPException(status_code=404, detail="Jam room not found or expired.")
    room = dict(jam_rooms[room_id])
    room["member_count"] = jam_manager.member_count(room_id)
    return room


@app.delete("/api/jam/{room_id}")
async def end_jam(room_id: str, current_user: User = Depends(get_current_user)):
    if room_id not in jam_rooms:
        raise HTTPException(status_code=404, detail="Jam room not found.")
    if jam_rooms[room_id]["host_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can end the jam.")
    del jam_rooms[room_id]
    await jam_manager.broadcast(room_id, {"type": "jam_ended"})
    return {"message": "Jam ended."}


@app.websocket("/ws/jam/{room_id}")
async def jam_websocket(ws: WebSocket, room_id: str, token: str):
    from jose import JWTError, jwt
    from app.auth import SECRET_KEY, ALGORITHM
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        auth_id = payload.get("sub")
        user = db.scalar(select(User).where(User.auth_id == auth_id)) if auth_id else None
    except JWTError:
        user = None
    finally:
        db.close()

    if not user:
        await ws.close(code=4001)
        return
    if room_id not in jam_rooms:
        await ws.close(code=4004)
        return

    await jam_manager.connect(room_id, user.id, ws)
    room = jam_rooms[room_id]
    is_host = room["host_id"] == user.id

    # Calculate live playback position so new joiners start at the right spot
    live_position_ms = room.get("position_ms", 0)
    if room.get("is_playing") and room.get("started_at"):
        try:
            started = datetime.fromisoformat(room["started_at"])
            elapsed_ms = (datetime.now(timezone.utc) - started).total_seconds() * 1000
            live_position_ms = int(room["position_ms"] + elapsed_ms)
        except Exception:
            pass

    # Send current state to joiner
    await ws.send_text(json.dumps({
        "type": "jam_state",
        "room": room,
        "is_host": is_host,
        "member_count": jam_manager.member_count(room_id),
        "position_ms": live_position_ms,
    }))

    # Notify others
    await jam_manager.broadcast(room_id, {
        "type": "member_update",
        "username": user.auth_id,
        "action": "joined",
        "member_count": jam_manager.member_count(room_id),
    }, exclude_user_id=user.id)

    try:
        while True:
            raw = await ws.receive_text()
            if room_id not in jam_rooms:
                break
            try:
                data = json.loads(raw)
            except Exception:
                continue

            msg_type = data.get("type")
            if msg_type not in ("play", "pause", "seek", "track_change", "sync") or not is_host:
                continue

            now = utcnow()
            room = jam_rooms[room_id]
            room["updated_at"] = now

            if msg_type == "track_change":
                room["track"] = data.get("track")
                room["position_ms"] = 0
                room["is_playing"] = True
                room["started_at"] = now
            elif msg_type == "play":
                room["is_playing"] = True
                room["position_ms"] = data.get("position_ms", room["position_ms"])
                room["started_at"] = now
            elif msg_type == "pause":
                room["is_playing"] = False
                room["position_ms"] = data.get("position_ms", room["position_ms"])
                room["started_at"] = None
            elif msg_type == "seek":
                room["position_ms"] = data.get("position_ms", 0)
                if room.get("is_playing"):
                    room["started_at"] = now
            # sync: no state change, just broadcast position to guests

            await jam_manager.broadcast(room_id, {
                "type": msg_type,
                **{k: v for k, v in data.items() if k != "type"},
                "updated_at": now,
            }, exclude_user_id=user.id)

    except WebSocketDisconnect:
        jam_manager.disconnect(room_id, user.id, ws)
        if room_id in jam_rooms:
            await jam_manager.broadcast(room_id, {
                "type": "member_update",
                "username": user.auth_id,
                "action": "left",
                "member_count": jam_manager.member_count(room_id),
            })


# ─── Settings ────────────────────────────────────────────────────────────────

def _get_or_create_settings(db: Session) -> AppSettings:
    row = db.scalar(select(AppSettings).limit(1))
    if not row:
        row = AppSettings()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@app.get("/api/settings", response_model=SettingsResponse)
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401)
    row = _get_or_create_settings(db)
    return SettingsResponse(
        music_source=row.music_source,
        yt_format=row.yt_format or "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best",
        has_yt_cookies=bool(row.yt_cookies),
        spotify_client_id=row.spotify_client_id,
        has_spotify_secret=bool(row.spotify_client_secret),
    )


@app.put("/api/settings", response_model=SettingsResponse)
async def update_settings(
    body: SettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401)
    row = _get_or_create_settings(db)
    row.music_source = body.music_source
    row.yt_format = body.yt_format or "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best"
    if body.yt_cookies_changed:
        row.yt_cookies = body.yt_cookies or None
    row.spotify_client_id = body.spotify_client_id or None
    if body.spotify_secret_changed:
        row.spotify_client_secret = body.spotify_client_secret or None
    row.updated_at = datetime.utcnow()
    db.commit()
    invalidate_config()
    return SettingsResponse(
        music_source=row.music_source,
        yt_format=row.yt_format,
        has_yt_cookies=bool(row.yt_cookies),
        spotify_client_id=row.spotify_client_id,
        has_spotify_secret=bool(row.spotify_client_secret),
    )


# ─── Messaging ───────────────────────────────────────────────────────────────

@app.post("/api/messages", response_model=MessageResponse)
async def send_message(
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    recipient = db.scalar(select(User).where(User.auth_id == body.recipient_username.strip().lower()))
    if not recipient:
        raise HTTPException(status_code=404, detail="User not found.")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself.")

    reply_to_content = None
    reply_to_sender = None
    if body.reply_to_id:
        parent = db.get(Message, body.reply_to_id)
        if parent and (
            (parent.sender_id == current_user.id and parent.recipient_id == recipient.id) or
            (parent.sender_id == recipient.id and parent.recipient_id == current_user.id)
        ):
            reply_to_content = parent.content
            reply_to_sender = parent.sender.auth_id
        else:
            body.reply_to_id = None

    msg = Message(
        sender_id=current_user.id,
        recipient_id=recipient.id,
        content=body.content.strip(),
        reply_to_id=body.reply_to_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    payload = {
        "type": "new_message",
        "id": msg.id,
        "sender_id": msg.sender_id,
        "recipient_id": msg.recipient_id,
        "sender_username": current_user.auth_id,
        "recipient_username": recipient.auth_id,
        "content": msg.content,
        "created_at": msg.created_at.isoformat(),
        "reply_to_id": msg.reply_to_id,
        "reply_to_content": reply_to_content,
        "reply_to_sender": reply_to_sender,
    }
    # Push to both sender and recipient
    await manager.send_to_user(current_user.id, payload)
    await manager.send_to_user(recipient.id, payload)

    # Push updated unread count to recipient
    last_read_ts = _get_last_read(db, recipient.id, current_user.id)
    unread_q = select(func.count(Message.id)).where(
        Message.sender_id == current_user.id,
        Message.recipient_id == recipient.id,
    )
    if last_read_ts:
        unread_q = unread_q.where(Message.created_at > last_read_ts)
    unread_count = db.scalar(unread_q) or 0
    await manager.send_to_user(recipient.id, {
        "type": "unread_update",
        "sender_username": current_user.auth_id,
        "count": unread_count,
    })

    return MessageResponse(**{k: v for k, v in payload.items() if k != "type"})


@app.get("/api/messages/conversations", response_model=List[ConversationSummary])
async def get_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    # Get all users current_user has exchanged messages with
    partner_ids_q = db.execute(
        select(
            func.coalesce(
                func.nullif(Message.sender_id, current_user.id),
                Message.recipient_id
            ).label("partner_id")
        ).where(
            or_(Message.sender_id == current_user.id, Message.recipient_id == current_user.id)
        ).distinct()
    ).scalars().all()

    conversations = []
    for pid in partner_ids_q:
        if pid == current_user.id:
            continue
        partner = db.get(User, pid)
        if not partner:
            continue

        last_msg = db.scalar(
            select(Message).where(
                or_(
                    and_(Message.sender_id == current_user.id, Message.recipient_id == pid),
                    and_(Message.sender_id == pid, Message.recipient_id == current_user.id),
                )
            ).order_by(Message.created_at.desc()).limit(1)
        )
        if not last_msg:
            continue

        last_read_ts = _get_last_read(db, current_user.id, pid)
        unread_q = select(func.count(Message.id)).where(
            Message.sender_id == pid,
            Message.recipient_id == current_user.id,
        )
        if last_read_ts:
            unread_q = unread_q.where(Message.created_at > last_read_ts)
        unread_count = db.scalar(unread_q) or 0

        conversations.append(ConversationSummary(
            other_user_id=partner.id,
            other_username=partner.auth_id,
            other_display_name=partner.display_name,
            other_profile_image=partner.profile_image,
            last_message=last_msg.content,
            last_message_at=last_msg.created_at,
            unread_count=unread_count,
        ))

    conversations.sort(key=lambda c: c.last_message_at, reverse=True)
    return conversations


@app.get("/api/messages/{username}/read-state")
async def get_read_state(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401)
    other = db.scalar(select(User).where(User.auth_id == username.lower()))
    if not other:
        raise HTTPException(status_code=404)

    last_mine = db.scalar(
        select(Message).where(
            Message.sender_id == current_user.id,
            Message.recipient_id == other.id,
        ).order_by(Message.created_at.desc()).limit(1)
    )
    partner_read_at = _get_last_read(db, other.id, current_user.id)
    partner_has_read = bool(last_mine and partner_read_at and partner_read_at >= last_mine.created_at)
    return {"partner_has_read": partner_has_read}


@app.get("/api/messages/{username}", response_model=List[MessageResponse])
async def get_conversation(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    other = db.scalar(select(User).where(User.auth_id == username.lower()))
    if not other:
        raise HTTPException(status_code=404, detail="User not found.")

    msgs = db.scalars(
        select(Message).where(
            or_(
                and_(Message.sender_id == current_user.id, Message.recipient_id == other.id),
                and_(Message.sender_id == other.id, Message.recipient_id == current_user.id),
            )
        ).order_by(Message.created_at.asc())
    ).all()

    # Batch-load parent messages for replies
    parent_ids = {m.reply_to_id for m in msgs if m.reply_to_id}
    parents: dict[int, Message] = {}
    if parent_ids:
        for pm in db.scalars(select(Message).where(Message.id.in_(parent_ids))).all():
            parents[pm.id] = pm

    return [
        MessageResponse(
            id=m.id,
            sender_id=m.sender_id,
            recipient_id=m.recipient_id,
            sender_username=m.sender.auth_id,
            recipient_username=m.recipient.auth_id,
            content=m.content,
            created_at=m.created_at,
            reply_to_id=m.reply_to_id,
            reply_to_content=parents[m.reply_to_id].content if m.reply_to_id and m.reply_to_id in parents else None,
            reply_to_sender=parents[m.reply_to_id].sender.auth_id if m.reply_to_id and m.reply_to_id in parents else None,
        )
        for m in msgs
    ]


@app.get("/api/users/{username}/online")
async def user_online_status(username: str, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.auth_id == username.lower()))
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"online": bool(manager.active.get(user.id))}


@app.get("/api/users/search")
async def search_users(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    users = db.scalars(
        select(User).where(
            User.auth_id.ilike(f"%{q}%"),
            User.id != current_user.id,
            User.auth_id != "guest_user",
        ).limit(10)
    ).all()
    return [{"username": u.auth_id, "display_name": u.display_name, "profile_image": u.profile_image} for u in users]


@app.websocket("/ws/messages")
async def websocket_messages(ws: WebSocket, token: str):
    from jose import JWTError, jwt
    from app.auth import SECRET_KEY, ALGORITHM
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        auth_id = payload.get("sub")
        user = db.scalar(select(User).where(User.auth_id == auth_id)) if auth_id else None
    except JWTError:
        user = None
    finally:
        db.close()

    if not user:
        await ws.close(code=4001)
        return

    await manager.connect(user.id, ws)
    await manager.broadcast_status(user.auth_id, online=True)
    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=25)
            except asyncio.TimeoutError:
                # Keepalive: send ping; if the connection is dead this raises and we exit
                try:
                    await ws.send_text('{"type":"ping"}')
                except Exception:
                    break
                continue
            except WebSocketDisconnect:
                break

            try:
                data = json.loads(raw)
            except Exception:
                continue

            msg_type = data.get("type")

            if msg_type in ("ping", "pong"):
                continue

            if msg_type == "typing":
                recipient_username = data.get("recipient_username", "").strip().lower()
                if not recipient_username:
                    continue
                db2 = SessionLocal()
                try:
                    recipient = db2.scalar(select(User).where(User.auth_id == recipient_username))
                finally:
                    db2.close()
                if recipient:
                    await manager.send_to_user(recipient.id, {
                        "type": "typing",
                        "sender_username": user.auth_id,
                    })

            elif msg_type == "mark_read":
                sender_username = data.get("sender_username", "").strip().lower()
                if not sender_username:
                    continue
                db2 = SessionLocal()
                try:
                    sender = db2.scalar(select(User).where(User.auth_id == sender_username))
                    if sender:
                        _upsert_last_read(db2, user.id, sender.id)
                finally:
                    db2.close()
                if sender:
                    await manager.send_to_user(sender.id, {
                        "type": "messages_read",
                        "reader_username": user.auth_id,
                    })
                    await manager.send_to_user(user.id, {
                        "type": "unread_update",
                        "sender_username": sender_username,
                        "count": 0,
                    })

    finally:
        manager.disconnect(user.id, ws)
        # Only broadcast offline when this was the user's last active connection
        if not manager.active.get(user.id):
            await manager.broadcast_status(user.auth_id, online=False)
