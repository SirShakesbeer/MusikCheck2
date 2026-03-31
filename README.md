# MusikCheck2

Web-based multiplayer music quiz prototype with a backend-driven game state, lobby-based persistence, and real-time host/player synchronization.

## Technology

- Frontend: React 18, TypeScript, Vite, React Router
- Backend: FastAPI, SQLAlchemy 2, Pydantic Settings
- Realtime: WebSocket lobby broadcasts
- Database drivers: SQLite (default local), PostgreSQL (Docker and optional local)
- Packaging/runtime: Docker + docker compose, uvicorn for local backend

## Current User Flows

- Home: `/`
  - Host creates a lobby immediately and is sent to setup.
  - Join sends player to lobby-code entry.
- Join: `/join`
  - Enter lobby code, continue to player page.
- Host setup: `/host/setup/:code`
  - Restores saved setup state and lobby-scoped sources.
  - Autosaves host/setup/mode choices.
- Host lobby: `/host/lobby/:code`
  - Round controls, scoring controls, Spotify options.
- Player page: `/player/:code`
  - Team join/readiness flow.

## Architecture and Data Flow

### 1) Source ingestion and indexing

Source providers (local folder/files, YouTube playlist, Spotify playlist, text list) are normalized by provider services.

Typical host setup flow:

1. Frontend calls `POST /api/media/sources/add-orchestrated` with provider input and lobby code.
2. Backend registers source (`media_sources`) and indexes/syncs tracks (`indexed_tracks`).
3. Backend links source to the active lobby (`lobby_sources`).
4. Host setup reload uses `GET /api/lobbies/{code}/sources` to reconstruct source list.

### 2) Setup persistence

Host setup changes are backend-persisted:

- Host name
- Teams
- Selected preset and custom mode config
- Setup mode title
- Spotify connected flag

Flow:

1. Setup page autosaves with `POST /api/lobbies/{code}/setup`.
2. Setup page restore uses `GET /api/lobbies/{code}/setup` + `GET /api/lobbies/{code}/sources`.
3. Mode updates are persisted with `POST /api/lobbies/{code}/mode`.

### 3) Round lifecycle (backend authoritative)

1. Host starts round (`POST /api/lobbies/{code}/rounds/start`).
2. Engine selects a track from sources linked to this lobby only.
3. Stage playback bumps a persisted `playback_token` so replay events are deterministic after reconnect/restart.
4. Engine emits full state via REST response + WebSocket broadcast.
5. Host/player clients render from backend state; frontend does not own game truth.

### 4) Realtime sync

- WebSocket endpoint: `/ws/{lobby_code}`
- Backend broadcasts updated full game state after gameplay/setup-changing actions.
- Frontend still performs REST calls for commands and bootstrap reads.

### 5) Session expiration and cleanup

- Lobbies expire 24 hours after creation (`lobbies.expires_at`).
- Backend enforces expiry when loading lobby state.
- Automatic cleanup runs:
  - once at backend startup
  - every 5 minutes in a background task
- Cleanup removes:
  - expired lobbies and their runtime/game rows
  - orphaned lobby-source link rows

Frontend setup/lobby pages detect expiry and show a recovery message with navigation back to home.

## API Surface (high-level)

### Game modes

- `GET /api/game-modes`
- `POST /api/game-modes`
- `POST /api/game-modes/validate`

### Media

- `POST /api/media/ingest-preview`
- `POST /api/media/sources/add-orchestrated`
- `POST /api/media/sources/local`
- `POST /api/media/sources/register`
- `POST /api/media/sources/{source_id}/index`
- `POST /api/media/sources/{source_id}/sync`
- `GET /api/media/sources`
- `GET /api/media/tracks`
- `GET /api/media/tracks/{track_id}/stream`

### Lobby and setup persistence

- `POST /api/lobbies`
- `GET /api/lobbies/{code}`
- `POST /api/lobbies/{code}/setup`
- `GET /api/lobbies/{code}/setup`
- `GET /api/lobbies/{code}/sources`
- `POST /api/lobbies/{code}/sources/remove`
- `POST /api/lobbies/{code}/mode`
- `POST /api/lobbies/{code}/teams/sync`
- `GET /api/lobbies/{code}/validate-start`

### Gameplay

- `POST /api/lobbies/{code}/rounds/start`
- `POST /api/lobbies/{code}/rounds/next`
- `POST /api/lobbies/{code}/rounds/play-stage`
- `POST /api/lobbies/{code}/rounds/next-stage`
- `POST /api/lobbies/{code}/rounds/finish`
- `POST /api/lobbies/{code}/rounds/stop`
- `POST /api/lobbies/{code}/rounds/guess`
- `POST /api/lobbies/{code}/rounds/fact-toggle`
- `POST /api/lobbies/{code}/rounds/wrong-guess-penalty`

### Player actions

- `POST /api/lobbies/{code}/join`
- `POST /api/lobbies/{code}/players/ready`

### Spotify and runtime config

- `GET /api/spotify/auth-url`
- `GET /api/spotify/callback`
- `GET /api/spotify/status`
- `GET /api/spotify/access-token`
- `POST /api/spotify/activate-device`
- `POST /api/spotify/play-random`
- `POST /api/lobbies/{code}/spotify`
- `GET /api/runtime/config`
- `POST /api/runtime/config`

## Database Explanation (all databases)

The application supports two database backends with the same SQLAlchemy model schema.

### 1) SQLite (default local development)

- Default `DATABASE_URL`: `sqlite:///./dev.db`
- File location when running backend from `backend/`: `backend/dev.db`
- Best for local dev and quick testing.

### 2) PostgreSQL (Docker/default containerized deployment)

- Used by `docker-compose.yml`
- Connection string in compose backend service:
  `postgresql+psycopg://musikcheck:musikcheck@db:5432/musikcheck`
- Best for containerized deployments and shared environments.

### 3) Table-by-table purpose

- `lobbies`
  - Core lobby identity and lifecycle (`code`, `host_name`, `mode_key`, `created_at`, `expires_at`).
  - Expiration clock starts at creation (24h).

- `teams`
  - Team names and cumulative scores for a lobby.

- `players`
  - Player identity and assigned team for lobby join flow.

- `lobby_runtime_states`
  - Per-lobby mutable runtime/setup snapshot:
    - song counter
    - serialized mode config
    - saved setup teams
    - setup mode title
    - spotify connected flag

- `player_runtime_states`
  - Per-player readiness state.

- `active_round_states`
  - Single current round snapshot per lobby:
    - selected media metadata
    - stage progression
    - reveal state
    - playback provider/ref
    - playback token
    - snippet offset metadata

- `active_round_team_states`
  - Per-team round scoring state for current round (artist/title/bonus + lock metadata).

- `media_sources`
  - Canonical source registrations (provider + source value), reusable at catalog level.

- `indexed_tracks`
  - Ingested/indexed tracks derived from `media_sources`, used for round selection.

- `lobby_sources`
  - Association table linking which media sources are active for a specific lobby setup.
  - Enables lobby-scoped track selection and setup restore.

### 4) Migrations/schema evolution

- On startup, backend runs:
  - `Base.metadata.create_all(...)`
  - `apply_schema_patches()` for additive columns on existing tables
- This keeps existing local/dev DBs forward-compatible without a dedicated Alembic pipeline.

### 5) Retention and cleanup behavior

- Expired lobby cleanup also removes dependent runtime/round/team/player rows.
- Orphan `lobby_sources` links are removed if either linked lobby or source no longer exists.
- `media_sources` and `indexed_tracks` are not globally purged by this cleanup loop.

## Run with Docker

Create a root `.env` (optional, for API keys and mode toggles):

```bash
TEST_MODE=true
YOUTUBE_API_KEY=your_api_key
YOUTUBE_DEFAULT_PLAYLIST=PLxxxxxxxxxxxx
```

Start:

```bash
docker compose up --build
```

- Frontend: http://localhost:5173/
- Backend API: http://localhost:8000/api

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Optional `backend/.env` example:

```bash
TEST_MODE=false
YOUTUBE_API_KEY=your_api_key
YOUTUBE_DEFAULT_PLAYLIST=PLxxxxxxxxxxxx
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/api/spotify/callback
SPOTIFY_SCOPES=streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state
```

To use PostgreSQL locally instead of SQLite:

```bash
DATABASE_URL=postgresql+psycopg://musikcheck:musikcheck@localhost:5432/musikcheck
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Notes

- Spotify playback requires an active Spotify playback device (and typically Premium).
- Use `127.0.0.1` (not `localhost`) in Spotify redirect URI for local callback reliability.
- For large local music libraries, pre-indexing via script can reduce setup wait time:

```bash
cd backend
python scripts/index_local_library.py "D:/Music"
```

## PlantUML Diagrams

- Database schema: [docs/diagrams/database-schema.puml](docs/diagrams/database-schema.puml)
- Runtime architecture: [docs/diagrams/architecture.puml](docs/diagrams/architecture.puml)

Render in VS Code with any PlantUML extension, or via a PlantUML CLI pipeline.

## TODO

### gameplay

- Add additional mode plugins (`music_video`, `lyrics`, `instrumental`, `speed round`, `STRÄWKCÜR`) (ffmpeg audio/video/frames extraction)
- fix randomization, ensure cross source randomization
- Persist rounds/songs/history-tables (consistent with MusikCheck)
- persist game status on reload (use states)
- create persistance of user info (settings, user created gamemodes, highscores, connected local databases) (highscores consistent with MusikCheck)
- add a local database ingestion tool that can be connected in the ui (consistent with MusikCheck)
- adjust point system to be more similar to MusikCheck (penalty points, lock artist/title guess points)

### UI

- fix UI placement
- update point display
- add point buttons
- update graphics, icons, colors, animations

### Finally

- security:
  - spotify connection security
- tests
- make game locally installable