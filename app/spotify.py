import asyncio
import tempfile
import os
import yt_dlp
from typing import List, Dict, Any, Optional


def _parse_tracks(items) -> List[Dict[str, Any]]:
    tracks = []
    for item in items:
        images = item.get("album", {}).get("images", [])
        artist = ", ".join(a["name"] for a in item.get("artists", []))
        # Encode title+artist into track_id so the resolve endpoint can cross-search YT
        tracks.append({
            "track_id": f"spotify|{item['id']}|{item['name']}|{artist}",
            "name": item["name"],
            "artist": artist,
            "album": item.get("album", {}).get("name", ""),
            "album_art": images[0]["url"] if images else None,
            "duration_ms": item.get("duration_ms", 0),
        })
    return tracks


def _sp(client_id: str, client_secret: str):
    import spotipy
    from spotipy.oauth2 import SpotifyClientCredentials
    return spotipy.Spotify(auth_manager=SpotifyClientCredentials(
        client_id=client_id,
        client_secret=client_secret,
    ))


def spotify_search(query: str, limit: int, client_id: str, client_secret: str) -> List[Dict[str, Any]]:
    results = _sp(client_id, client_secret).search(q=query, limit=limit, type="track")
    return _parse_tracks(results["tracks"]["items"])


def spotify_trending(limit: int, client_id: str, client_secret: str) -> List[Dict[str, Any]]:
    results = _sp(client_id, client_secret).search(q="top hits 2025", limit=limit, type="track")
    return _parse_tracks(results["tracks"]["items"])


def _ytdlp_cross_search(title: str, artist: str, fmt: str, cookies_content: Optional[str]) -> Optional[str]:
    """Search YouTube for title+artist and return the best audio stream URL."""
    query = f"{title} {artist}".strip()
    ydl_opts = {
        "format": fmt or "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
    }
    tmp_path = None
    if cookies_content:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write(cookies_content)
            tmp_path = f.name
        ydl_opts["cookiefile"] = tmp_path
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch1:{query}", download=False)
            entries = (info or {}).get("entries") or []
            if entries:
                entry = entries[0]
                url = entry.get("url")
                if not url:
                    for fmt_item in reversed(entry.get("formats") or []):
                        if fmt_item.get("url") and fmt_item.get("acodec") != "none":
                            url = fmt_item["url"]
                            break
                if url:
                    print(f"Spotify cross-search stream for '{query}'")
                return url
    except Exception as e:
        print(f"Spotify YT cross-search failed for '{query}': {e}")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    return None


async def spotify_get_stream_url(track_id: str, yt_format: str, yt_cookies: Optional[str]) -> Optional[str]:
    # track_id format: "spotify|{id}|{title}|{artist}"
    parts = track_id.split("|", 3)
    title = parts[2] if len(parts) > 2 else ""
    artist = parts[3] if len(parts) > 3 else ""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _ytdlp_cross_search, title, artist, yt_format, yt_cookies)


async def pipe_cross_search(track_id: str, yt_format: Optional[str], cookies_content: Optional[str]):
    """Cross-search YouTube for Spotify track, pipe m4a to stdout via ffmpeg.
    Returns (process, tmp_cookie_path)."""
    parts = track_id.split("|", 3)
    title = parts[2] if len(parts) > 2 else ""
    artist = parts[3] if len(parts) > 3 else ""
    query = f"{title} {artist}".strip()

    tmp_path = None
    cmd = ["yt-dlp"]
    if cookies_content:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write(cookies_content)
            tmp_path = f.name
        cmd += ["--cookies", tmp_path]

    cmd += [
        "-f", yt_format or "bestaudio",
        "-x", "--audio-format", "m4a", "--audio-quality", "0",
        "--no-playlist", "--quiet", "--no-warnings",
        "-o", "-",
        f"ytsearch1:{query}",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    return proc, tmp_path
