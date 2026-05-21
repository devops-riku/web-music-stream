import re
import asyncio
import shutil
import os
import httpx
import yt_dlp
from ytmusicapi import YTMusic
from typing import List, Dict, Any, Optional
from app.stream_cache import is_healthy, mark_dead

def _hq_thumbnail(thumbnails: list) -> str | None:
    if not thumbnails:
        return None
    url = thumbnails[-1]["url"]
    url = re.sub(r'=w\d+-h\d+.*$', '=w500-h500-l90-rj', url)
    return url

async def _fetch_itunes_art(client: httpx.AsyncClient, title: str, artist: str, fallback: str) -> str:
    try:
        term = f"{title} {artist}"
        r = await client.get(
            "https://itunes.apple.com/search",
            params={"term": term, "media": "music", "limit": 1, "entity": "song"},
            timeout=4,
        )
        results = r.json().get("results", [])
        if results:
            # artworkUrl100 → replace 100x100 with 600x600
            art = results[0].get("artworkUrl100", "")
            if art:
                return art.replace("100x100bb", "600x600bb")
    except Exception:
        pass
    return fallback

async def _enrich_with_itunes(tracks: List[Dict]) -> List[Dict]:
    async with httpx.AsyncClient() as client:
        tasks = [
            _fetch_itunes_art(client, t["name"], t["artist"], t.get("album_art") or "")
            for t in tracks
        ]
        arts = await asyncio.gather(*tasks)
    for track, art in zip(tracks, arts):
        if art:
            track["album_art"] = art
    return tracks

class YouTubeMusicAPI:
    def __init__(self):
        self.yt = YTMusic()
        
    def search(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search YouTube Music for tracks.
        """
        results = self.yt.search(query, filter="songs", limit=limit)
        
        tracks = []
        for item in results:
            # Extract highest quality thumbnail
            thumbnails = item.get("thumbnails", [])
            album_art = _hq_thumbnail(thumbnails)
            
            # Extract artists
            artists = ", ".join([a["name"] for a in item.get("artists", [])])
            
            # Calculate duration in ms
            duration_str = item.get("duration", "0:00")
            try:
                parts = duration_str.split(":")
                if len(parts) == 2:
                    duration_ms = (int(parts[0]) * 60 + int(parts[1])) * 1000
                elif len(parts) == 3:
                    duration_ms = (int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])) * 1000
                else:
                    duration_ms = 0
            except:
                duration_ms = 0

            tracks.append({
                "track_id": item["videoId"],
                "name": item["title"],
                "artist": artists,
                "album": item.get("album", {}).get("name", "") if item.get("album") else "Single",
                "album_art": album_art,
                "duration_ms": duration_ms
            })
            
        return tracks

    def get_trending(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get trending tracks. Falls back to a popular-music search if the
        charts endpoint no longer returns a songs section.
        """
        try:
            charts = self.yt.get_charts(country='US')
            songs_section = charts.get('songs', {})
            songs = songs_section.get('items', []) if isinstance(songs_section, dict) else []

            if songs:
                tracks = []
                for item in songs[:limit]:
                    thumbnails = item.get("thumbnails", [])
                    album_art = _hq_thumbnail(thumbnails)
                    artists = ", ".join([a["name"] for a in item.get("artists", [])])
                    tracks.append({
                        "track_id": item["videoId"],
                        "name": item["title"],
                        "artist": artists,
                        "album": item.get("album", {}).get("name", "") if item.get("album") else "Single",
                        "album_art": album_art,
                        "duration_ms": 0
                    })
                return tracks
        except Exception as e:
            print(f"Error fetching charts: {e}")

        # Fallback: search for popular tracks
        return self.search("top hits 2024", limit=limit)

    async def get_stream_url(
        self,
        video_id: str,
        yt_format: str = "bestaudio/best",
        cookies_content: Optional[str] = None,
    ) -> Optional[str]:
        # If caller supplied cookies, skip public proxies and go straight to yt-dlp
        if cookies_content:
            return await asyncio.get_event_loop().run_in_executor(
                None, self._get_stream_url_ytdlp, video_id, yt_format, cookies_content
            )
        # 1) Try Piped instances
        url = await self._get_stream_url_piped(video_id)
        if url:
            return url
        # 2) Try Invidious instances
        url = await self._get_stream_url_invidious(video_id)
        if url:
            return url
        # 3) Fall back to yt-dlp
        return await asyncio.get_event_loop().run_in_executor(
            None, self._get_stream_url_ytdlp, video_id, yt_format, None
        )

    def _get_stream_url_ytdlp(
        self,
        video_id: str,
        yt_format: str = "bestaudio/best",
        cookies_content: Optional[str] = None,
    ) -> Optional[str]:
        import tempfile
        tmp_path = None
        if cookies_content:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
                f.write(cookies_content)
                tmp_path = f.name
        elif os.path.isfile("/app/cookies.txt"):
            shutil.copy2("/app/cookies.txt", "/tmp/yt_cookies.txt")
            tmp_path = "/tmp/yt_cookies.txt"

        ydl_opts = {
            "format": yt_format,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "extractor_args": {"youtube": {"player_client": ["mweb", "android_music", "tv"]}},
        }
        if tmp_path:
            ydl_opts["cookiefile"] = tmp_path

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(
                    f"https://www.youtube.com/watch?v={video_id}",
                    download=False
                )
                url = info.get("url")
                if not url and info.get("formats"):
                    for fmt in reversed(info["formats"]):
                        if fmt.get("url") and fmt.get("acodec") != "none":
                            url = fmt["url"]
                            break
                if url:
                    print(f"yt-dlp stream for {video_id}")
                return url
        except Exception as e:
            print(f"yt-dlp failed for {video_id}: {e}")
            return None
        finally:
            if cookies_content and tmp_path:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

    async def _get_stream_url_piped(self, video_id: str) -> Optional[str]:
        instances = [
            "https://pipedapi.kavin.rocks",
            "https://api.piped.private.coffee",
            "https://pipedapi.r4fo.com",
            "https://pipedapi.adminforge.de",
            "https://pipedapi.in.projectsegfau.lt",
            "https://pipedapi.us.projectsegfau.lt",
            "https://api.piped.yt",
            "https://pipedapi.darkness.services",
            "https://piped-api.hostux.net",
            "https://pipedapi.drgns.space",
            "https://pipedapi.smnz.de",
            "https://piapi.ggtyler.dev",
            "https://pipedapi.reallyaweso.me",
            "https://pipedapi.leptons.xyz",
        ]
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            for instance in instances:
                if not is_healthy(instance):
                    continue
                try:
                    r = await client.get(f"{instance}/streams/{video_id}")
                    if r.status_code != 200:
                        mark_dead(instance)
                        continue
                    if 'application/json' not in r.headers.get('content-type', ''):
                        mark_dead(instance)
                        continue
                    data = r.json()
                    audio_streams = data.get('audioStreams', [])
                    audio_streams = [s for s in audio_streams if s.get('url')]
                    if not audio_streams:
                        mark_dead(instance)
                        continue
                    # Prefer m4a (audio/mp4) over webm/opus for browser compatibility
                    m4a = [s for s in audio_streams if 'mp4' in (s.get('mimeType') or '').lower()]
                    pool = m4a if m4a else audio_streams
                    pool.sort(key=lambda s: s.get('bitrate', 0), reverse=True)
                    stream_url = pool[0]['url']
                    print(f"Piped stream via {instance}")
                    return stream_url
                except Exception as e:
                    print(f"Piped {instance} failed: {e}")
                    mark_dead(instance)
        return None

    async def _get_stream_url_invidious(self, video_id: str) -> Optional[str]:
        instances = [
            "https://invidious.fdn.fr",
            "https://yewtu.be",
            "https://invidious.nerdvpn.de",
            "https://invidious.perennialte.ch",
            "https://inv.nadeko.net",
            "https://invidious.materialio.us",
            "https://invidious.privacyredirect.com",
            "https://invidious.protokolla.fi",
            "https://iv.datura.network",
            "https://invidious.lunar.icu",
        ]
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            for instance in instances:
                if not is_healthy(instance):
                    continue
                try:
                    r = await client.get(f"{instance}/api/v1/videos/{video_id}")
                    if r.status_code != 200:
                        mark_dead(instance)
                        continue
                    if 'application/json' not in r.headers.get('content-type', ''):
                        mark_dead(instance)
                        continue
                    data = r.json()
                    audio_formats = [
                        f for f in data.get('adaptiveFormats', [])
                        if f.get('type', '').startswith('audio/') and f.get('url')
                    ]
                    if not audio_formats:
                        mark_dead(instance)
                        continue
                    # Prefer m4a/AAC over webm/opus
                    m4a = [f for f in audio_formats if 'mp4' in f.get('type', '').lower()]
                    pool = m4a if m4a else audio_formats
                    pool.sort(
                        key=lambda f: int(f.get('bitrate', '0') if f.get('bitrate') else '0'),
                        reverse=True,
                    )
                    stream_url = pool[0]['url']
                    print(f"Invidious stream via {instance}")
                    return stream_url
                except Exception as e:
                    print(f"Invidious {instance} failed: {e}")
                    mark_dead(instance)
        return None

    async def pipe_audio(
        self,
        video_id: str,
        yt_format: str = "bestaudio",
        cookies_content: Optional[str] = None,
    ):
        """Spawn yt-dlp → ffmpeg, piping m4a to stdout. Returns (process, tmp_cookie_path)."""
        import tempfile
        tmp_path = None
        cmd = ["yt-dlp"]
        if cookies_content:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
                f.write(cookies_content)
                tmp_path = f.name
            cmd += ["--cookies", tmp_path]
        elif os.path.isfile("/app/cookies.txt"):
            cmd += ["--cookies", "/app/cookies.txt"]

        cmd += [
            "-f", yt_format or "bestaudio",
            "-x", "--audio-format", "m4a", "--audio-quality", "0",
            "--no-playlist", "--quiet", "--no-warnings",
            "--extractor-args", "youtube:player_client=mweb,android_music,tv",
            "-o", "-",
            f"https://www.youtube.com/watch?v={video_id}",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        return proc, tmp_path


ytmusic_api = YouTubeMusicAPI()

