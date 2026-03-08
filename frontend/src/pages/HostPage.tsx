import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { Scoreboard } from '../components/Scoreboard';
import { api } from '../services/api';
import { connectLobbySocket } from '../services/ws';
import type { GameState, RoundState } from '../types';

type AppMode = 'single-tv' | 'multiplayer';

type LocalTeam = {
  id: string;
  name: string;
  score: number;
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
const LOCAL_SONGS: LocalSong[] = [
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

export function HostPage() {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [setupTeams, setSetupTeams] = useState('Team A, Team B');
  const [localTeams, setLocalTeams] = useState<LocalTeam[]>([]);
  const [localStarted, setLocalStarted] = useState(false);
  const [localSongIndex, setLocalSongIndex] = useState<number | null>(null);
  const [localRevealed, setLocalRevealed] = useState(false);
  const [lastPlayedStageIndex, setLastPlayedStageIndex] = useState<number>(0);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);

  const [hostName, setHostName] = useState('Host');
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localCurrentSong = localSongIndex === null ? null : LOCAL_SONGS[localSongIndex % LOCAL_SONGS.length];

  useEffect(() => {
    if (!state?.lobby_code) return;
    return connectLobbySocket(state.lobby_code, setState);
  }, [state?.lobby_code]);

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

    setLocalTeams(names.map((name, index) => ({ id: `local-${index + 1}`, name, score: 0 })));
    setLocalStarted(true);
    setLocalSongIndex(null);
    setLocalRevealed(false);
    setLastPlayedStageIndex(0);
    setError(null);
    setLocalMessage('Local game started. Click Next Song to begin a round.');
  };

  const updateLocalScore = (teamId: string, delta: number) => {
    setLocalTeams((previous) =>
      previous.map((team) => (team.id === teamId ? { ...team, score: team.score + delta } : team)),
    );
  };

  const playLocalSnippet = (stageIndex: number) => {
    if (!localCurrentSong) {
      setLocalMessage('Click Next Song first.');
      return;
    }

    const audio = localAudioRef.current ?? new Audio(localCurrentSong.snippetUrl);
    localAudioRef.current = audio;
    audio.src = localCurrentSong.snippetUrl;
    audio.pause();
    audio.currentTime = 0;
    void audio.play();

    window.setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
    }, LOCAL_STAGE_DURATIONS[stageIndex] * 1000);

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
    setLocalSongIndex((previous) => {
      if (previous === null) return 0;
      return (previous + 1) % LOCAL_SONGS.length;
    });
    setLocalRevealed(false);
    setLastPlayedStageIndex(0);
    setLocalMessage('New song round started.');
  };

  const getSourceInfo = (song: LocalSong) => {
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

  useEffect(() => {
    return () => {
      const audio = localAudioRef.current;
      if (audio) {
        audio.pause();
      }
    };
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
              {localCurrentSong.artist} — {localCurrentSong.title} • {getSourceInfo(localCurrentSong)}
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
