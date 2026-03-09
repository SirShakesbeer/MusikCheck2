import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { Scoreboard } from '../components/Scoreboard';
import { api } from '../services/api';
import { HtmlAudioSnippetPlayer } from '../services/snippetPlayer';
import { connectLobbySocket } from '../services/ws';
import type { GameState, RoundState } from '../types';

type AppMode = 'single-tv' | 'multiplayer';

type LocalTeam = {
  id: string;
  name: string;
  score: number;
};

type SourceType = 'youtube-playlist' | 'spotify-playlist' | 'local-folder';

type LocalSource = {
  id: string;
  type: SourceType;
  value: string;
  backendSourceId?: string;
  importedCount?: number;
  ingestError?: string;
};

type LocalSong = {
  title: string;
  artist: string;
  sourceType: 'local' | 'youtube' | 'spotify';
  sourceValue: string;
  snippetUrl: string;
};

const LOCAL_STAGE_DURATIONS = [2, 5, 8];
const LOCAL_STAGE_POINTS = [100, 60, 30];
const PLACEHOLDER_SNIPPET_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const LOCAL_MAX_POINTS = 300;
const MOCK_LOCAL_SONGS: LocalSong[] = [
  {
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    sourceType: 'local',
    sourceValue: 'C:/Music/Party/NeverGonnaGiveYouUp.mp3',
    snippetUrl: PLACEHOLDER_SNIPPET_URL,
  },
  {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    sourceType: 'youtube',
    sourceValue: 'YouTube',
    snippetUrl: PLACEHOLDER_SNIPPET_URL,
  },
  {
    title: 'Take On Me',
    artist: 'a-ha',
    sourceType: 'spotify',
    sourceValue: 'Spotify',
    snippetUrl: PLACEHOLDER_SNIPPET_URL,
  },
];

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'youtube-playlist', label: 'YouTube Playlist Link' },
  { value: 'spotify-playlist', label: 'Spotify Playlist Link' },
  { value: 'local-folder', label: 'Local Folder' },
];

export function HostPage() {
  const snippetPlayer = useMemo(() => new HtmlAudioSnippetPlayer(), []);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<AppMode | null>(null);
  const [setupTeams, setSetupTeams] = useState('Team A, Team B');
  const [localSources, setLocalSources] = useState<LocalSource[]>([]);
  const [newSourceType, setNewSourceType] = useState<SourceType>('local-folder');
  const [newSourceValue, setNewSourceValue] = useState('');
  const [pendingLocalFileCount, setPendingLocalFileCount] = useState<number>(0);
  const [localTeams, setLocalTeams] = useState<LocalTeam[]>([]);
  const [localSongs, setLocalSongs] = useState<LocalSong[]>(MOCK_LOCAL_SONGS);
  const [localStarted, setLocalStarted] = useState(false);
  const [localSongIndex, setLocalSongIndex] = useState<number | null>(null);
  const [localRevealed, setLocalRevealed] = useState(false);
  const [lastPlayedStageIndex, setLastPlayedStageIndex] = useState<number>(0);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const [hostName, setHostName] = useState('Host');
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtimeTestMode, setRuntimeTestMode] = useState<boolean>(true);
  const [youtubeApiConfigured, setYoutubeApiConfigured] = useState<boolean>(false);
  const [runtimeConfigBusy, setRuntimeConfigBusy] = useState<boolean>(false);

  const providerKeyByType: Record<SourceType, string> = {
    'youtube-playlist': 'youtube_playlist',
    'spotify-playlist': 'spotify_playlist',
    'local-folder': 'local_files',
  };

  const localCurrentSong = localSongIndex === null ? null : localSongs[localSongIndex % localSongs.length];
  const localCurrentSource =
    localSongIndex === null || localSources.length === 0 ? null : localSources[localSongIndex % localSources.length];

  useEffect(() => {
    if (!state?.lobby_code) return;
    return connectLobbySocket(state.lobby_code, setState);
  }, [state?.lobby_code]);

  useEffect(() => {
    const loadRuntimeConfig = async () => {
      try {
        const result = await api.getRuntimeConfig();
        setRuntimeTestMode(Boolean(result.data.test_mode));
        setYoutubeApiConfigured(Boolean(result.data.youtube_api_key_configured));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void loadRuntimeConfig();
  }, []);

  const createLobby = async () => {
    try {
      const result = await api.createLobby(hostName);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startRound = async () => {
    if (!state) return;
    const result = await api.startRound(state.lobby_code);
    setState(result.data);
  };

  const nextStage = async () => {
    if (!state) return;
    const result = await api.nextStage(state.lobby_code);
    setState(result.data);
  };

  const startLocalGame = () => {
    const names = setupTeams
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length < 1) {
      setError('Please enter at least one team name.');
      return;
    }

    const begin = async () => {
      if (runtimeTestMode) {
        setLocalSongs(MOCK_LOCAL_SONGS);
      } else {
        const sourceIds = localSources.map((source) => source.backendSourceId).filter(Boolean) as string[];
        const result = await api.getIndexedTracks(sourceIds.length > 0 ? sourceIds : undefined);
        const dynamicSongs: LocalSong[] = result.data.tracks.map((track) => ({
          title: track.title,
          artist: track.artist,
          sourceType:
            track.provider_key === 'youtube_playlist'
              ? 'youtube'
              : track.provider_key === 'spotify_playlist'
                ? 'spotify'
                : 'local',
          sourceValue: track.source_value,
          snippetUrl: PLACEHOLDER_SNIPPET_URL,
        }));

        if (dynamicSongs.length < 1) {
          throw new Error('No indexed tracks found. Add a source and sync/index before starting.');
        }

        setLocalSongs(dynamicSongs);
      }

      setLocalTeams(names.map((name, index) => ({ id: `local-${index + 1}`, name, score: 0 })));
      setLocalStarted(true);
      setLocalSongIndex(null);
      setLocalRevealed(false);
      setLastPlayedStageIndex(0);
      setError(null);
      setLocalMessage('Local game started. Click Next Song to begin a round.');
    };

    void begin().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  const addLocalSource = async () => {
    if (!newSourceValue.trim()) {
      setError('Please enter a source value before adding.');
      return;
    }

    const sourceType = newSourceType;
    const sourceValue = newSourceValue.trim();

    if (sourceType === 'local-folder') {
      if (!sourceValue || pendingLocalFileCount < 1) {
        setError('Please choose a local folder first.');
        return;
      }

      try {
        const registered = await api.registerLocalSource(sourceValue);
        const sourceState = registered.data.source;
        const indexed = await api.runLocalSourceIndex(sourceState.id);

        setLocalSources((previous) => [
          ...previous,
          {
            id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: sourceType,
            value: sourceValue,
            backendSourceId: sourceState.id,
            importedCount: indexed.data.total_tracks,
          },
        ]);
        setNewSourceValue('');
        setPendingLocalFileCount(0);
        setError(null);
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
    }

    try {
      const registered = await api.registerSource(providerKeyByType[sourceType], sourceValue);
      const sourceState = registered.data.source;
      const synced = await api.runSourceSync(sourceState.id);
      const importedCount = Number(synced.data.total_tracks ?? 0);

      setLocalSources((previous) => [
        ...previous,
        {
          id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: sourceType,
          value: sourceValue,
          backendSourceId: sourceState.id,
          importedCount,
        },
      ]);
      setNewSourceValue('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const updateLocalSource = (sourceId: string, patch: Partial<Pick<LocalSource, 'type' | 'value'>>) => {
    setLocalSources((previous) => previous.map((source) => (source.id === sourceId ? { ...source, ...patch } : source)));
  };

  const removeLocalSource = (sourceId: string) => {
    setLocalSources((previous) => previous.filter((source) => source.id !== sourceId));
  };

  const onFolderFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length < 1) {
      return;
    }

    const firstRelativePath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
    const folderName = firstRelativePath.includes('/') ? firstRelativePath.split('/')[0] : files[0].name;
    setNewSourceValue(folderName || 'selected-folder');
    setPendingLocalFileCount(files.length);
    setError(null);
  };

  const pickLocalFolder = async () => {
    const windowWithDirectoryPicker = window as Window & {
      showDirectoryPicker?: () => Promise<{ name: string }>;
    };

    if (windowWithDirectoryPicker.showDirectoryPicker) {
      try {
        const handle = await windowWithDirectoryPicker.showDirectoryPicker();
        setNewSourceValue(handle.name);
        setPendingLocalFileCount(1);
        setError(null);
        return;
      } catch {
        return;
      }
    }

    folderInputRef.current?.click();
  };

  const updateLocalScore = (teamId: string, delta: number) => {
    setLocalTeams((previous) =>
      previous.map((team) => (team.id === teamId ? { ...team, score: team.score + delta } : team)),
    );
  };

  const playLocalSnippet = async (stageIndex: number) => {
    if (!localCurrentSong) {
      setLocalMessage('Click Next Song first.');
      return;
    }

    await snippetPlayer.play({
      snippetUrl: localCurrentSong.snippetUrl,
      durationSeconds: LOCAL_STAGE_DURATIONS[stageIndex],
    });

    setLastPlayedStageIndex(stageIndex);
    setLocalMessage(`Playing snippet ${stageIndex + 1} (${LOCAL_STAGE_DURATIONS[stageIndex]}s).`);
  };

  const revealLocalSong = () => {
    if (!localCurrentSong) {
      setLocalMessage('No active song to reveal.');
      return;
    }
    setLocalRevealed(true);
  };

  const nextLocalSong = () => {
    if (localSongs.length < 1) {
      setLocalMessage('No songs available. Add and sync sources first.');
      return;
    }

    setLocalSongIndex((previous) => {
      if (previous === null) return 0;
      return (previous + 1) % localSongs.length;
    });
    setLocalRevealed(false);
    setLastPlayedStageIndex(0);
    setLocalMessage('New song round started.');
  };

  const getSourceInfo = (song: LocalSong, source: LocalSource | null) => {
    if (source) {
      if (source.type === 'local-folder') {
        return `Local folder: ${source.value}`;
      }
      if (source.type === 'youtube-playlist') {
        return 'YouTube';
      }
      return 'Spotify';
    }

    if (song.sourceType === 'local') {
      return `Local file: ${song.sourceValue}`;
    }
    if (song.sourceType === 'youtube') {
      return 'YouTube';
    }
    return 'Spotify';
  };

  const resetToMenu = () => {
    setMode(null);
    setState(null);
    setLocalTeams([]);
    setLocalStarted(false);
    setLocalSongIndex(null);
    setLocalRevealed(false);
    setLastPlayedStageIndex(0);
    setLocalMessage(null);
    setError(null);
  };

  const onToggleRuntimeTestMode = async (enabled: boolean) => {
    setRuntimeConfigBusy(true);
    try {
      const result = await api.updateRuntimeConfig(enabled);
      setRuntimeTestMode(Boolean(result.data.test_mode));
      setYoutubeApiConfigured(Boolean(result.data.youtube_api_key_configured));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRuntimeConfigBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      snippetPlayer.dispose();
    };
  }, [snippetPlayer]);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  const localRoundForPanel: RoundState | null = localCurrentSong
    ? {
        stage_index: lastPlayedStageIndex,
        stage_duration_seconds: LOCAL_STAGE_DURATIONS[lastPlayedStageIndex],
        points_available: LOCAL_STAGE_POINTS[lastPlayedStageIndex],
        snippet_url: localCurrentSong.snippetUrl,
        can_guess: false,
        status: 'playing',
      }
    : null;

  return (
    <main>
      <h1>MusikCheck2 Host</h1>

      {!mode && (
        <section>
          <h3>Game Menu</h3>
          <p>Choose how you want to play before starting.</p>
          <label>
            <input
              type="checkbox"
              checked={runtimeTestMode}
              onChange={(event: ChangeEvent<HTMLInputElement>) => void onToggleRuntimeTestMode(event.target.checked)}
              disabled={runtimeConfigBusy}
            />
            Test mode (placeholder snippets)
          </label>
          {!runtimeTestMode && !youtubeApiConfigured && (
            <p>YouTube API key is not configured; real YouTube ingestion will fail.</p>
          )}
          <button onClick={() => setMode('single-tv')}>Single TV (one mouse)</button>
          <button onClick={() => setMode('multiplayer')}>Phone Connections (optional)</button>
        </section>
      )}

      {mode === 'single-tv' && !localStarted && (
        <section>
          <h3>Single TV Setup</h3>
          <p>Enter team names separated by commas.</p>
          <input
            value={setupTeams}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSetupTeams(event.target.value)}
          />

          <h4>Sources</h4>
          {localSources.length > 0 && (
            <div className="source-list">
              {localSources.map((source) => (
                <div key={source.id} className="source-row">
                  <select
                    value={source.type}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      updateLocalSource(source.id, { type: event.target.value as SourceType })
                    }
                  >
                    {SOURCE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={source.value}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateLocalSource(source.id, { value: event.target.value })
                    }
                    placeholder="Source value"
                  />
                  <span>{source.importedCount !== undefined ? `${source.importedCount} imported` : ''}</span>
                  <button onClick={() => removeLocalSource(source.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}

          <div className="source-add-block">
            <select
              value={newSourceType}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setNewSourceType(event.target.value as SourceType);
                setNewSourceValue('');
                setPendingLocalFileCount(0);
              }}
            >
              {SOURCE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {newSourceType === 'local-folder' ? (
              <>
                <button onClick={pickLocalFolder}>Choose Folder</button>
                <input value={newSourceValue} readOnly placeholder="No folder selected" />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={onFolderFilesSelected}
                />
              </>
            ) : (
              <input
                value={newSourceValue}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setNewSourceValue(event.target.value)}
                placeholder="Paste playlist link"
              />
            )}

            <button onClick={addLocalSource}>Add Source</button>
          </div>

          <button onClick={startLocalGame}>Start Game</button>
          <button onClick={resetToMenu}>Back to Menu</button>
        </section>
      )}

      {mode === 'single-tv' && localStarted && (
        <section className="single-tv-screen">
          <p>Mode: Single TV</p>

          <div className="top-controls">
            <button onClick={() => playLocalSnippet(0)} disabled={!localCurrentSong}>
              Snippet 1
            </button>
            <button onClick={() => playLocalSnippet(1)} disabled={!localCurrentSong}>
              Snippet 2
            </button>
            <button onClick={() => playLocalSnippet(2)} disabled={!localCurrentSong}>
              Snippet 3
            </button>
            <div className="spacer" />
            <button onClick={revealLocalSong} disabled={!localCurrentSong}>
              Reveal
            </button>
            <button onClick={nextLocalSong}>Next Song</button>
          </div>

          {localRevealed && localCurrentSong && (
            <p>
              {localCurrentSong.artist} — {localCurrentSong.title} • {getSourceInfo(localCurrentSong, localCurrentSource)}
            </p>
          )}

          {localCurrentSong && (
            <p>
              Active stage points: {localRoundForPanel?.points_available ?? LOCAL_STAGE_POINTS[0]} (last snippet:{' '}
              {lastPlayedStageIndex + 1})
            </p>
          )}

          <Scoreboard teams={localTeams} />
          <section>
            <h3>Teams</h3>
            {localTeams.map((team) => (
              <div key={team.id} className="team-row">
                <div className="team-label">{team.name}</div>
                <div className="team-lane">
                  <div
                    className="team-box"
                    style={{ left: `${Math.max(0, Math.min(1, team.score / LOCAL_MAX_POINTS)) * 90}%` }}
                  >
                    {team.score}
                  </div>
                </div>
                <div className="team-actions">
                  <button
                    onClick={() =>
                      updateLocalScore(team.id, localRoundForPanel?.points_available ?? LOCAL_STAGE_POINTS[lastPlayedStageIndex])
                    }
                    disabled={!localCurrentSong}
                  >
                    +Stage Points
                  </button>
                  <button onClick={() => updateLocalScore(team.id, -10)}>-10</button>
                </div>
              </div>
            ))}
          </section>
          {localMessage && <p>{localMessage}</p>}

          <div className="bottom-row">
            <button className="quit-button" onClick={resetToMenu}>
              Quit
            </button>
          </div>
        </section>
      )}

      {mode === 'multiplayer' && !state && (
        <section>
          <h3>Optional Phone Lobby Setup</h3>
          <label>
            Host name
            <input value={hostName} onChange={(event: ChangeEvent<HTMLInputElement>) => setHostName(event.target.value)} />
          </label>
          <button onClick={createLobby}>Create Lobby</button>
          <button onClick={resetToMenu}>Back to Menu</button>
        </section>
      )}

      {mode === 'multiplayer' && state && (
        <>
          <p>Mode: Phone Connections (optional)</p>
          <p>Lobby code: {state.lobby_code}</p>
          <p>
            Players join at <strong>/player/{state.lobby_code}</strong>
          </p>
          <RoundPanel round={state.current_round} onStart={startRound} onNextStage={nextStage} />
          {state.message && <p>{state.message}</p>}
          <Scoreboard teams={state.teams} />
          <h3>Players</h3>
          <ul>
            {state.players.map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
          </ul>
          <Link to={`/player/${state.lobby_code}`}>Open Player View</Link>
          <p>
            <button onClick={resetToMenu}>End Lobby / Menu</button>
          </p>
        </>
      )}

      {error && <p>{error}</p>}
    </main>
  );
}
