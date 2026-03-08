import { ChangeEvent, useEffect, useState } from 'react';
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

const LOCAL_STAGE_DURATIONS = [2, 5, 8];
const LOCAL_STAGE_POINTS = [100, 60, 30];
const PLACEHOLDER_SNIPPET_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function HostPage() {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [setupTeams, setSetupTeams] = useState('Team A, Team B');
  const [localTeams, setLocalTeams] = useState<LocalTeam[]>([]);
  const [localStarted, setLocalStarted] = useState(false);
  const [localRound, setLocalRound] = useState<RoundState | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const [hostName, setHostName] = useState('Host');
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setLocalRound(null);
    setError(null);
    setLocalMessage('Local game started. Start a round to play snippets and score by stage points.');
  };

  const updateLocalScore = (teamId: string, delta: number) => {
    setLocalTeams((previous) =>
      previous.map((team) => (team.id === teamId ? { ...team, score: team.score + delta } : team)),
    );
  };

  const startLocalRound = () => {
    setLocalRound({
      stage_index: 0,
      stage_duration_seconds: LOCAL_STAGE_DURATIONS[0],
      points_available: LOCAL_STAGE_POINTS[0],
      snippet_url: PLACEHOLDER_SNIPPET_URL,
      can_guess: false,
      status: 'playing',
    });
    setLocalMessage('Round started. Use stage points for scoring.');
  };

  const nextLocalStage = () => {
    setLocalRound((previous) => {
      if (!previous) return previous;
      const nextIndex = previous.stage_index + 1;
      if (nextIndex >= LOCAL_STAGE_DURATIONS.length) {
        setLocalMessage('Round ended - no guess.');
        return { ...previous, status: 'finished' };
      }

      setLocalMessage(`Advanced to stage ${nextIndex + 1}.`);
      return {
        ...previous,
        stage_index: nextIndex,
        stage_duration_seconds: LOCAL_STAGE_DURATIONS[nextIndex],
        points_available: LOCAL_STAGE_POINTS[nextIndex],
        status: 'playing',
      };
    });
  };

  const resetToMenu = () => {
    setMode(null);
    setState(null);
    setLocalTeams([]);
    setLocalStarted(false);
    setLocalRound(null);
    setLocalMessage(null);
    setError(null);
  };

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
        <>
          <p>Mode: Single TV</p>
          <RoundPanel round={localRound} onStart={startLocalRound} onNextStage={nextLocalStage} />
          <Scoreboard teams={localTeams} />
          <section>
            <h3>Team Controls</h3>
            {localTeams.map((team) => (
              <p key={team.id}>
                <strong>{team.name}</strong>{' '}
                <button
                  onClick={() =>
                    updateLocalScore(team.id, localRound?.points_available ?? LOCAL_STAGE_POINTS[LOCAL_STAGE_POINTS.length - 1])
                  }
                >
                  +Stage Points
                </button>
                <button onClick={() => updateLocalScore(team.id, -10)}>-10 Penalty</button>
              </p>
            ))}
          </section>
          {localMessage && <p>{localMessage}</p>}
          <button onClick={resetToMenu}>End Game / Menu</button>
        </>
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
