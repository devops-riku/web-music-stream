import re
import asyncio
import httpx
import yt_dlp
from ytmusicapi import YTMusic
from typing import List, Dict, Any, Optional

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

    def get_stream_url(self, video_id: str) -> Optional[str]:
        ydl_opts = {
            'format': 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'extractor_args': {
                'youtube': {
                    'player_client': ['web_music', 'android_music', 'web'],
                }
            },
            'http_headers': {
                'User-Agent': (
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/124.0.0.0 Safari/537.36'
                ),
            },
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(
                    f"https://music.youtube.com/watch?v={video_id}",
                    download=False
                )
                url = info.get('url')
                if not url and info.get('formats'):
                    url = info['formats'][-1].get('url')
                return url
        except Exception as e:
            print(f"yt-dlp error for {video_id}: {e}")
            return None

ytmusic_api = YouTubeMusicAPI()
