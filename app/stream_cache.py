import time
from typing import Optional, Dict, Tuple

_url_cache: Dict[str, Tuple[str, float]] = {}
_health: Dict[str, float] = {}

URL_TTL = 900       # 15 min — raw YouTube URLs typically valid ~6 h
BLACKLIST_TTL = 300 # 5 min before retrying a dead Piped/Invidious instance


def get_cached_url(track_id: str) -> Optional[str]:
    entry = _url_cache.get(track_id)
    if entry and entry[1] > time.time():
        return entry[0]
    _url_cache.pop(track_id, None)
    return None


def cache_url(track_id: str, url: str) -> None:
    _url_cache[track_id] = (url, time.time() + URL_TTL)


def is_healthy(instance: str) -> bool:
    until = _health.get(instance)
    return not (until and until > time.time())


def mark_dead(instance: str) -> None:
    _health[instance] = time.time() + BLACKLIST_TTL
