from typing import Optional
from dataclasses import dataclass


@dataclass
class AppConfig:
    music_source: str = "soundcloud"
    yt_format: str = "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best"
    yt_cookies: Optional[str] = None
    spotify_client_id: Optional[str] = None
    spotify_client_secret: Optional[str] = None


_cache: Optional[AppConfig] = None


def get_config(db) -> AppConfig:
    global _cache
    if _cache is not None:
        return _cache
    from sqlalchemy import select
    from app.models import AppSettings
    row = db.scalar(select(AppSettings).limit(1))
    _cache = AppConfig(
        music_source=row.music_source if row else "soundcloud",
        yt_format=row.yt_format if row and row.yt_format else "bestaudio/best",
        yt_cookies=row.yt_cookies if row else None,
        spotify_client_id=row.spotify_client_id if row else None,
        spotify_client_secret=row.spotify_client_secret if row else None,
    )
    return _cache


def invalidate():
    global _cache
    _cache = None
