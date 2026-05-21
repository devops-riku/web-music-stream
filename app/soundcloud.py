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
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(track_url, download=False)
            formats = info.get("formats") or []

            # SoundCloud exposes both full-track streams and 30-second preview
            # snippets in the same format list. Preview format IDs contain
            # "preview" (e.g. "hls-opus-64-preview"). Exclude them first.
            full = [
                f for f in formats
                if f.get("url")
                and f.get("acodec") != "none"
                and "preview" not in (f.get("format_id") or "").lower()
            ]
            # Fall back to anything audio if all formats happen to be preview-labelled
            if not full:
                full = [f for f in formats if f.get("url") and f.get("acodec") != "none"]

            if full:
                full.sort(key=lambda f: f.get("abr") or f.get("tbr") or 0, reverse=True)
                url = full[0]["url"]
                print(f"SoundCloud stream ({full[0].get('format_id', '?')}) for {track_url}")
                return url

            return info.get("url")
    except Exception as e:
        print(f"SoundCloud stream failed for {track_url}: {e}")
        return None


class SoundCloudAPI:
    async def search(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _extract_flat, query, limit)

    async def get_trending(self, limit: int = 20) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _extract_flat, "OPM 2026", limit)

    async def get_stream_url(self, track_url: str) -> Optional[str]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _get_stream_url, track_url)


soundcloud_api = SoundCloudAPI()
