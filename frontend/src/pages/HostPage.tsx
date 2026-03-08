import { ChangeEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { Scoreboard } from '../components/Scoreboard';
import { api } from '../services/api';
import { connectLobbySocket } from '../services/ws';
import type { GameState } from '../types';

export function HostPage() {
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

  return (
    <main>
      <h1>MusikCheck2 Host</h1>
      {!state && (
        <section>
          <label>
            Host name
            <input value={hostName} onChange={(event: ChangeEvent<HTMLInputElement>) => setHostName(event.target.value)} />
          </label>
          <button onClick={createLobby}>Create Lobby</button>
        </section>
      )}

      {state && (
        <>
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
        </>
      )}

      {error && <p>{error}</p>}
    </main>
  );
}
