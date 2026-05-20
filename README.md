# Rikupy — Music Streaming App

A full-stack music streaming app powered by **YouTube Music** and **yt-dlp**. No Spotify account or API key required. Stream any song for free, like tracks to your library, chat with other users, and host real-time Music Jam sessions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Python 3.11, Uvicorn |
| Frontend | React 19, Vite, Mantine v9 |
| Database | PostgreSQL 16 + SQLAlchemy 2.0 + Alembic |
| Music Source | YouTube Music (ytmusicapi + yt-dlp) |
| Album Art | iTunes Search API (600×600) |
| Auth | JWT (username/password) |
| Real-time | WebSockets (messaging + Music Jam) |
| Proxy | FastAPI StreamingResponse (bypasses CDN blocks) |
| Deployment | Docker Compose + Traefik + Let's Encrypt |

---

## Features

- **Search** — YouTube Music search with server-side pagination (20 per page)
- **Stream** — Full tracks proxied through the backend; bypasses network-level YouTube blocks
- **Library** — Like/unlike tracks saved to PostgreSQL
- **Home** — Trending tracks with hero banner and curated cards
- **Messages** — Real-time DMs between users via WebSocket
- **Music Jam** — Share a room link and listen to the same song in real-time, position-synced every 2 seconds
- **Mobile responsive** — Dual footer layout, works on phone and desktop

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL running locally

### 1. Backend

```powershell
# Create and activate virtualenv
py -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

Create `.env` in the project root:

```ini
SECRET_KEY=your-secret-key
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=5432
DB_NAME=music_stream
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

Run migrations and start the server:

```powershell
.\venv\Scripts\alembic upgrade head
.\venv\Scripts\uvicorn app.main:app --reload
```

API runs at **http://localhost:8000** — docs at **http://localhost:8000/docs**

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**

`frontend/.env`:

```ini
VITE_BACKEND_API=http://localhost:8000
VITE_BACKEND_WS=ws://localhost:8000
```

---

## Production Deployment (Docker + Traefik)

All production config lives in `docker/.env`:

```ini
DOMAIN=rikupy.linkerx.dev
ACME_EMAIL=admin@linkerx.dev

SECRET_KEY=your-long-random-secret
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=db_rikupy
DB_PORT=5432
DB_NAME=music_stream
CORS_ORIGINS=https://rikupy.linkerx.dev

VITE_BACKEND_API=https://rikupy.linkerx.dev
VITE_BACKEND_WS=wss://rikupy.linkerx.dev
```

Deploy:

```bash
cd docker
docker compose up -d --build
```

Traefik automatically provisions a Let's Encrypt TLS certificate and routes:

- `https://rikupy.linkerx.dev/api/*` and `/ws/*` → FastAPI backend
- `https://rikupy.linkerx.dev/*` → React frontend (nginx)

Alembic migrations run automatically on backend container start.

---

## Project Structure

```
├── app/
│   ├── main.py          # FastAPI app, all endpoints, WebSocket handlers
│   ├── models.py        # SQLAlchemy models (User, LikedTrack, Message)
│   ├── schemas.py       # Pydantic schemas
│   ├── auth.py          # JWT auth helpers
│   ├── config.py        # Settings (pydantic-settings)
│   ├── db.py            # Database engine & session
│   └── ytmusic.py       # YouTube Music search, stream URL, iTunes enrichment
├── alembic/             # Database migrations
├── frontend/
│   └── src/
│       ├── App.jsx      # Entire frontend (single-page app)
│       ├── App.css      # Component styles
│       └── index.css    # Global styles
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   ├── nginx.conf
│   └── .env             # Production credentials
├── .env                 # Local dev credentials
└── requirements.txt
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in, returns JWT |
| GET | `/api/me` | Get current user profile |

### Music
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/home` | Trending tracks |
| GET | `/api/search?q=&limit=&offset=` | Search YouTube Music |
| GET | `/api/player/stream?id=` | Proxy-stream audio (supports Range) |

### Library
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tracks/likes` | Get liked tracks |
| POST | `/api/tracks/{id}/like` | Like a track |
| DELETE | `/api/tracks/{id}/like` | Unlike a track |

### Messages
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/messages/conversations` | List conversations |
| GET | `/api/messages/{username}` | Get message thread |
| POST | `/api/messages` | Send a message |
| WS | `/ws/messages?token=` | Real-time messaging |

### Music Jam
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/jam` | Create a jam room |
| GET | `/api/jam/{room_id}` | Get room info |
| DELETE | `/api/jam/{room_id}` | End jam (host only) |
| WS | `/ws/jam/{room_id}?token=` | Real-time sync (play/pause/seek/track) |
