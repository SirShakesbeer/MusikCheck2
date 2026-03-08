import { ChangeEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { Scoreboard } from '../components/Scoreboard';
import { api } from '../services/api';
import { connectLobbySocket } from '../services/ws';
import type { GameState } from '../types';

type AppMode = 'single-tv' | 'multiplayer';

type LocalTeam = {
  id: string;
  name: string;
  score: number;
};

export function HostPage() {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [setupTeams, setSetupTeams] = useState('Team A, Team B');
  const [localTeams, setLocalTeams] = useState<LocalTeam[]>([]);
  const [localStarted, setLocalStarted] = useState(false);
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
    setError(null);
    setLocalMessage('Local game started. Teams can say STOP out loud; click the team controls.');
  };

  const updateLocalScore = (teamId: string, delta: number) => {
    setLocalTeams((previous) =>
      previous.map((team) => (team.id === teamId ? { ...team, score: team.score + delta } : team)),
    );
  };

  const stopForTeam = (teamName: string) => {
    setLocalMessage(`${teamName} called STOP.`);
  };

  const resetToMenu = () => {
    setMode(null);
    setState(null);
    setLocalTeams([]);
    setLocalStarted(false);
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
          <Scoreboard teams={localTeams} />
          <section>
            <h3>Team Controls</h3>
            {localTeams.map((team) => (
              <p key={team.id}>
                <strong>{team.name}</strong>{' '}
                <button onClick={() => stopForTeam(team.name)}>STOP</button>
                <button onClick={() => updateLocalScore(team.id, 10)}>+10</button>
                <button onClick={() => updateLocalScore(team.id, -10)}>-10</button>
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
