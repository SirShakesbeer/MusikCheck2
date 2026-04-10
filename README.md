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

#### Python Virtual Environment Setup (Recommended)

1. Install Python 3.10, 3.11, or 3.12 from https://www.python.org/downloads/ (avoid Python 3.14 for now).
2. Open a terminal in the project root.
3. Create a new virtual environment:
  ```bash
  python -m venv .venv
  ```
4. Activate the virtual environment:
  - On Windows:
    ```bash
    .venv\Scripts\activate
    ```
  - On macOS/Linux:
    ```bash
    source .venv/bin/activate
    ```
5. Upgrade pip and install dependencies:
  ```bash
  pip install --upgrade pip
  pip install -r backend/requirements.txt
  ```

Continue with the steps below to run the backend server.


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

Database schema

```plantuml
@startuml database-schema
hide methods
hide stereotypes
skinparam linetype ortho
skinparam classAttributeIconSize 0

title MusikCheck2 Database Schema

entity "lobbies" as lobbies {
  * id : uuid
  --
  code : varchar(8) <<unique,index>>
  host_name : varchar(64)
  mode_key : varchar(64)
  created_at : datetime
  expires_at : datetime
}

entity "teams" as teams {
  * id : uuid
  --
  lobby_id : uuid <<fk,index>>
  name : varchar(64)
  score : int
}

entity "players" as players {
  * id : uuid
  --
  lobby_id : uuid <<fk,index>>
  team_id : uuid <<fk,nullable>>
  name : varchar(64)
}

entity "lobby_runtime_states" as lobby_runtime_states {
  * lobby_id : uuid <<pk,fk>>
  --
  song_number : int
  mode_config : text
  setup_teams : text
  setup_mode_title : varchar(128)
  spotify_connected : bool
  updated_at : datetime
}

entity "player_runtime_states" as player_runtime_states {
  * player_id : uuid <<pk,fk>>
  --
  lobby_id : uuid <<fk,index>>
  ready : bool
  updated_at : datetime
}

entity "active_round_states" as active_round_states {
  * id : uuid
  --
  lobby_id : uuid <<fk,unique,index>>
  media_source_id : varchar(128)
  media_title : varchar(256)
  media_artist : varchar(256)
  media_path : varchar(2048)
  round_kind : varchar(64)
  song_number : int
  stage_index : int
  max_stage_reached : int
  can_guess : bool
  status : varchar(64)
  snippet_url : varchar(2048)
  playback_provider : varchar(64)
  playback_ref : varchar(2048)
  playback_token : int
  track_duration_seconds : int
  snippet_start_offsets : varchar(256)
  updated_at : datetime
}

entity "active_round_team_states" as active_round_team_states {
  * id : uuid
  --
  active_round_id : uuid <<fk,index>>
  team_id : uuid <<fk,index>>
  artist_points : int
  title_points : int
  bonus_points : int
  artist_awarded_stage : int <<nullable>>
  title_awarded_stage : int <<nullable>>
  updated_at : datetime
}

entity "media_sources" as media_sources {
  * id : uuid
  --
  provider_key : varchar(64) <<index>>
  source_value : varchar(1024) <<unique>>
  created_at : datetime
  updated_at : datetime
}

entity "indexed_tracks" as indexed_tracks {
  * id : uuid
  --
  source_id : uuid <<fk,index>>
  file_path : varchar(2048) <<unique>>
  title : varchar(256)
  artist : varchar(256)
  file_mtime : int
  file_size : int
  created_at : datetime
  updated_at : datetime
}

entity "lobby_sources" as lobby_sources {
  * id : uuid
  --
  lobby_id : uuid <<fk,index>>
  source_id : uuid <<fk,index>>
  source_type : varchar(64)
  source_value : varchar(1024)
  created_at : datetime
}

lobbies ||--o{ teams
lobbies ||--o{ players
lobbies ||--|| lobby_runtime_states
lobbies ||--o{ lobby_sources
lobbies ||--o| active_round_states

teams ||--o{ players
teams ||--o{ active_round_team_states

players ||--|| player_runtime_states

active_round_states ||--o{ active_round_team_states

media_sources ||--o{ indexed_tracks
media_sources ||--o{ lobby_sources

note bottom of lobbies
  TTL lifecycle:
  expires_at = created_at + 24h
  Expired lobbies are cleaned periodically.
end note

note right of lobby_sources
  Per-lobby source mapping used by:
  - setup restore
  - lobby-scoped media selection
end note

@enduml
```

Runtime architecture:

```plantuml
@startuml architecture
left to right direction
skinparam linetype ortho

title MusikCheck2 Runtime Architecture

actor Host
actor Player
cloud Spotify
cloud YouTube
folder "Local Filesystem" as LocalFS

node "Frontend (React + Vite)" as FE {
  component "Home/Join Routes" as FE_Routes
  component "HostSetupPage" as FE_Setup
  component "HostLobbyPage" as FE_Lobby
  component "PlayerPage" as FE_Player
  component "api.ts" as FE_API
  component "ws.ts" as FE_WS
  component "playbackDispatcher.ts" as FE_Playback
}

node "Backend (FastAPI)" as BE {
  component "routes.py" as BE_Routes
  component "game_engine.py" as BE_Engine
  component "game_mode_service.py" as BE_Modes
  component "media_ingestion_service.py" as BE_Ingest
  component "media_library_service.py" as BE_Library
  component "media_processing_service.py" as BE_Process
  component "ws_manager.py" as BE_WS
  component "cleanup loop (5 min)" as BE_Cleanup
}

database "SQL DB\n(SQLite dev / Postgres docker)" as DB

Host --> FE_Routes : Open app / host flow
Player --> FE_Player : Join lobby and set ready

FE_Setup --> FE_API : REST setup + source actions
FE_Lobby --> FE_API : Round controls + spotify options
FE_Player --> FE_API : Join / ready / guesses

FE_WS <..> BE_WS : WebSocket /ws/{lobby_code}\nstate broadcasts

FE_API --> BE_Routes : HTTP /api/*
BE_Routes --> BE_Engine : Lobby + round orchestration
BE_Routes --> BE_Modes : Validate/persist mode presets
BE_Routes --> BE_Ingest : Source provider ingestion
BE_Routes --> BE_Library : Register/index/sync tracks
BE_Routes --> BE_Process : Snippet generation

BE_Engine --> DB : Persist lobby/setup/round state
BE_Library --> DB : Persist media sources + indexed tracks
BE_Modes --> DB : Read preset references
BE_Cleanup --> DB : Delete expired lobbies\nand orphan lobby-source links

BE_Ingest --> YouTube : Playlist metadata fetch
BE_Ingest --> Spotify : Playlist metadata + auth status
BE_Library --> LocalFS : Local file scan/index

FE_Playback --> Spotify : Browser playback control
FE_Playback --> FE_Lobby : Token-driven playback sync

note right of BE_Engine
  Backend authoritative state:
  - playback_token persisted
  - lobby setup autosaved
  - sources scoped per lobby
end note

note bottom of FE_Setup
  Reopen /host/setup/:code restores:
  host, teams, mode config, sources,
  spotify_connected flag.
end note

@enduml
```

## TODO

### gameplay

- Add additional mode plugins (`music_video`, `lyrics`, `instrumental`, `speed round`, `STRÄWKCÜR`) (ffmpeg audio/video/frames extraction)
- switch music video to use ffmpeg extraction
- add a local database ingestion tool that can be connected in the ui
- adjust point system to be more similar to MusikCheck (penalty points, lock artist/title guess points)
- default german option and optional english localization

think of a solution: create persistance of user info across sessions (user created gamemodes, highscores, connected local databases)

### UI

- home menu
- host setup
- host lobby
- player screen

- paper look and animation for schnipsel
- animationss between screens

### code quality

- security:
  - spotify connection security
  - api calls
- tests

### MusikCheck 1 integration

make the following features consistent with MusikCheck 1

- database/local source integration
- highscore board

### improvement areas

- randomization, cross source randomization
- release year filter for youtube

### low-prio

- language filter
- add automatic song history file creation