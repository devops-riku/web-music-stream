import asyncio
import yt_dlp
from typing import List, Dict, Any, Optional


def _extract_flat(query: str, limit: int) -> List[Dict[str, Any]]:
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        results = ydl.extract_info(f"scsearch{limit}:{query}", download=False)
        tracks = []
        for entry in (results.get("entries") or []):
            if not entry:
                continue
            tracks.append({
                "track_id": entry.get("webpage_url") or entry.get("url", ""),
                "name": entry.get("title", ""),
                "artist": entry.get("uploader", ""),
                "album": entry.get("album") or "SoundCloud",
                "album_art": entry.get("thumbnail", ""),
                "duration_ms": int(entry.get("duration") or 0) * 1000,
            })
        return tracks


def _get_stream_url(track_url: str) -> Optional[str]:
    ydl_opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(track_url, download=False)
            url = info.get("url")
            if not url:
                for fmt in reversed(info.get("formats") or []):
                    if fmt.get("url") and fmt.get("acodec") != "none":
                        url = fmt["url"]
                        break
            return url
    except Exception as e:
        print(f"SoundCloud stream failed for {track_url}: {e}")
        return None


class SoundCloudAPI:
    async def search(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _extract_flat, query, limit)

    async def get_trending(self, limit: int = 20) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _extract_flat, "trending music PH", limit)

    async def get_stream_url(self, track_url: str) -> Optional[str]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _get_stream_url, track_url)


soundcloud_api = SoundCloudAPI()
