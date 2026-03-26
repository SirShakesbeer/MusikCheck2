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
  - Spotify playlist metadata (Spotify Web API client credentials)
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

- `backend/app/services/game_mode_service.py`: preset storage, validation, frequency scheduling (`audio`, `video`, `lyrics`, ...)
- Presets are persisted in `backend/app/data/game_mode_presets.json`
- `backend/app/services/game_engine.py`: lobbies, teams, round progression, STOP, guess scoring
- In non-test mode, round media is selected from indexed tracks; if none exist, optional `YOUTUBE_DEFAULT_PLAYLIST` can be used as fallback

### 3.1) Game Mode Presets

- `GET /api/game-modes`: list all available presets
- `POST /api/game-modes`: save a new preset for reuse
- `POST /api/lobbies`: can start from a preset and optionally override frequencies/filters inline
- Round type selection is frequency-based (for example video every 5 songs, lyrics every 10 songs)
- Filters are included in the mode model (`release_year_from`, `release_year_to`, `language`) and are ready for future media selection logic

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

## Preset-based Game Modes

Game modes are now data-driven presets (JSON + API), not hard-coded plugins.

To add a new round type later (for example `video`, `lyrics`, `instrumental`):
- add/enable the round kind in preset `round_rules`
- implement media rendering/selection behavior for that kind
- no registry/plugin wiring changes are required

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
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/api/spotify/callback
SPOTIFY_SCOPES=streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state
# Optional fallback playlist when no indexed sources exist
YOUTUBE_DEFAULT_PLAYLIST=PLxxxxxxxxxxxx
```

After editing `backend/.env`, restart the backend process so new values are loaded.

If you want PostgreSQL locally instead of SQLite, set:

```bash
DATABASE_URL=postgresql+psycopg://musikcheck:musikcheck@localhost:5432/musikcheck
```

Spotify integration note:

- Playlist ingestion now fetches real track metadata (title/artist/duration) from Spotify playlists.
- Host menu includes Spotify OAuth connect flow.
- For Spotify snippets, the app triggers random-start playback via Spotify Web API (`/me/player/play`).
- Spotify playback requires an active Spotify playback device and typically a Premium account.
- In your Spotify app settings, add the exact redirect URI used by backend (for local dev: `http://127.0.0.1:8000/api/spotify/callback`).
- For loopback HTTP redirects, Spotify requires explicit IP (`127.0.0.1` or `[::1]`), not `localhost`.
- If you change Spotify scopes, reconnect Spotify (authorize again) so a new access token is issued with updated scopes.

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
- persist game status on reload (use states)
- Add authentication and host permissions
- Add provider-specific ingestion workers
- make gamemode modular and create presets (which modes are included + frequency)
- add a local database ingestion tool that can be connected in the ui
- create persistance of user info (settings, user created gamemodes, highscores, connected local databases)
- add point system

### UI

- fix UI placement
- update point display
- add point buttons
- update graphics

### Finally

- security:
  - spotify connection security
- tests
- make game locally installable