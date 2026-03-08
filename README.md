# MusikCheck2

Modular web-based multiplayer music quiz party game prototype.

## Stack

- Frontend: React + TypeScript (Vite)
- Backend: FastAPI + Python
- Realtime: WebSockets
- Database: PostgreSQL (SQLAlchemy)
- Media processing: ffmpeg-ready backend container
- Packaging: Docker + docker-compose

## Architecture

### 1) Media Ingestion Layer

- `backend/app/domain/providers/base.py`: media provider interface
- Pluggable providers:
  - local files
  - text list
  - YouTube playlist (stub)
  - Spotify playlist metadata (stub)
- `backend/app/services/media_ingestion_service.py` handles provider registration + normalization entry point

### 2) Media Processing Layer

- `backend/app/services/media_processing_service.py`
- Encapsulates snippet building and caching by content fingerprint
- Prototype returns generated placeholder audio snippet URL (silent WAV data URI)
- Ready to swap in ffmpeg extraction logic

### 3) Game Engine

- `backend/app/domain/game_modes/base.py`: plugin contract for mode-specific behavior
- `backend/app/domain/game_modes/classic_audio.py`: stage durations, points, guess validation, UI config
- `backend/app/services/game_engine.py`: lobbies, teams, round progression, STOP, guess scoring

### 4) Multiplayer Layer

- REST endpoints in `backend/app/api/routes.py`
- WebSocket state broadcasting in `backend/app/core/ws_manager.py` and `backend/app/main.py`
- Players join lobby/team from phone, host controls rounds

### 5) Frontend Game UI

- `frontend/src/pages/HostPage.tsx`: create lobby, start round, advance stage, scoreboard
- `frontend/src/pages/PlayerPage.tsx`: join team, STOP button, guess form
- Shared components:
  - `Scoreboard`
  - `RoundPanel`

## Plugin-like Game Modes

Each mode plugin defines:
- snippet generation rules (`snippet_for_stage`)
- scoring rules (`stage_points`)
- UI config (`ui_config`)
- guess validation (`is_guess_correct`)

Add a new mode by implementing `GameModePlugin` and registering it in `service_container.py`.

## Prototype Features Included

- Pre-game menu before starting
- Single-TV mode (default) with one mouse controls
- Per-team manual controls for `STOP`, add points, deduct points
- Lobby creation
- Team join via phone interface (optional mode)
- Real-time game state updates over WebSockets
- Simple audio snippet round (placeholder media)
- Stage-based decreasing scoring

## Default Play Style

The host screen now starts with a menu:

- **Single TV (one mouse)**: all teams play on one screen with staged snippet rounds (start round, next stage, decreasing points). Host awards stage points or penalties with team buttons. No STOP mechanic in this mode.
- **Phone Connections (optional)**: same round mechanics plus players can press STOP on phones; host screen shows who pressed STOP.

## Run with Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:5173/host
- Backend: http://localhost:8000

## Local Development (without Docker)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Next Extension Targets

### gameplay

- Replace placeholder snippet generation with ffmpeg audio/video/frames extraction
- Add additional mode plugins (`music_video`, `lyrics`, `instrumental`)
- Persist rounds/songs/history tables
- Add authentication and host permissions
- Add provider-specific ingestion workers

### UI
