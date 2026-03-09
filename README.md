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
  - YouTube playlist (YouTube Data API)
  - Spotify playlist metadata (stub)
- `backend/app/services/media_ingestion_service.py` handles provider registration + normalization entry point
- `POST /api/media/ingest-preview` connects source inputs from the host setup UI to provider ingestion for validation/preview
- `POST /api/media/sources/register` registers any provider source value (including YouTube playlists)
- `POST /api/media/sources/{source_id}/sync` syncs provider tracks into indexed library rows used by gameplay
- Local large-library indexing flow:
  - `POST /api/media/sources/local` registers a local folder source
  - `POST /api/media/sources/{source_id}/index` indexes/updates tracks for that source
  - `GET /api/media/sources` returns registered sources with indexed track counts

For very large local libraries, prefer pre-indexing with the CLI script before game time:

```bash
cd backend
python scripts/index_local_library.py "D:/Music"
```

### 2) Media Processing Layer

- `backend/app/services/media_processing_service.py`
- Encapsulates snippet building and caching by content fingerprint
- In `TEST_MODE=true`, returns generated placeholder audio snippet URL (silent WAV data URI)
- In `TEST_MODE=false`, uses playable media URLs when available (currently YouTube embed URLs)
- Ready to swap in ffmpeg extraction logic

### 3) Game Engine

- `backend/app/domain/game_modes/base.py`: plugin contract for mode-specific behavior
- `backend/app/domain/game_modes/classic_audio.py`: stage durations, points, guess validation, UI config
- `backend/app/services/game_engine.py`: lobbies, teams, round progression, STOP, guess scoring
- In non-test mode, round media is selected from indexed tracks; if none exist, optional `YOUTUBE_DEFAULT_PLAYLIST` can be used as fallback

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
- Source setup in Single-TV menu supports editable source list with backend ingestion preview
- `frontend/src/services/snippetPlayer.ts` defines a `SnippetPlayer` interface (current implementation: `HtmlAudioSnippetPlayer`) for easier future media-type players

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

- **Test mode toggle**: available on the host menu so placeholder mode can be enabled/disabled without code changes.
- **Single TV (one mouse)**: all teams play on one screen with staged snippet rounds (start round, next stage, decreasing points). Host awards stage points or penalties with team buttons. No STOP mechanic in this mode.
- **Phone Connections (optional)**: same round mechanics plus players can press STOP on phones; host screen shows who pressed STOP.

## Run with Docker

Create a project root `.env` first (or copy `.env.example`):

```bash
TEST_MODE=true
YOUTUBE_API_KEY=your_api_key
YOUTUBE_DEFAULT_PLAYLIST=PLxxxxxxxxxxxx
```

```bash
docker compose up --build
```

- Frontend: http://localhost:5173/host
- Backend: http://localhost:8000

## Local Development (without Docker)

### Backend

Local backend runs default to SQLite (`backend/dev.db`), so no database service is required.

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

If you run from the workspace root instead of `backend`, use:

```bash
python -m uvicorn app.main:app --reload --app-dir backend
```

Create `backend/.env` (or export env vars) for real YouTube-backed rounds:

```bash
TEST_MODE=false
YOUTUBE_API_KEY=your_api_key
# Optional fallback playlist when no indexed sources exist
YOUTUBE_DEFAULT_PLAYLIST=PLxxxxxxxxxxxx
```

After editing `backend/.env`, restart the backend process so new values are loaded.

If you want PostgreSQL locally instead of SQLite, set:

```bash
DATABASE_URL=postgresql+psycopg://musikcheck:musikcheck@localhost:5432/musikcheck
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
