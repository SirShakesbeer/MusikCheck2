import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '../services/api';
import { connectLobbySocket } from '../services/ws';
import type { GameState } from '../types';

export function PlayerPage() {
  const { code = '' } = useParams();
  const [playerName, setPlayerName] = useState('Player');
  const [teamName, setTeamName] = useState('Team A');
  const [guessTitle, setGuessTitle] = useState('');
  const [guessArtist, setGuessArtist] = useState('');
  const [state, setState] = useState<GameState | null>(null);
  const [joinedTeamId, setJoinedTeamId] = useState<string | null>(null);
  const [joinedPlayerId, setJoinedPlayerId] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    return connectLobbySocket(code, setState);
  }, [code]);

  const teamId = useMemo(() => {
    if (joinedTeamId) return joinedTeamId;
    if (!state) return null;
    const team = state.teams.find((t) => t.name.toLowerCase() === teamName.toLowerCase());
    return team?.id ?? null;
  }, [joinedTeamId, state, teamName]);

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await api.joinLobby(code, playerName, teamName);
      setState(result.data);
      const joinedTeam = result.data.teams.find((team) => team.name.toLowerCase() === teamName.toLowerCase());
      setJoinedTeamId(joinedTeam?.id ?? null);
      const joinedPlayer = result.data.players.find(
        (player) => player.name.toLowerCase() === playerName.toLowerCase() && player.team_id === (joinedTeam?.id ?? null),
      );
      setJoinedPlayerId(joinedPlayer?.id ?? null);
      setPlayerReady(Boolean(joinedPlayer?.ready));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onToggleReady = async () => {
    if (!joinedPlayerId) return;
    const nextReady = !playerReady;
    const result = await api.setPlayerReady(code, joinedPlayerId, nextReady);
    setState(result.data);
    setPlayerReady(nextReady);
  };

  const onStop = async () => {
    if (!teamId) return;
    const result = await api.stopRound(code, teamId, playerName);
    setState(result.data);
  };

  const onGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!teamId) return;
    const result = await api.submitGuess(code, teamId, guessTitle, guessArtist);
    setState(result.data);
  };

  return (
    <main>
      <h1>Player</h1>
      <p>Lobby: {code}</p>
      <form onSubmit={onJoin}>
        <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Player name" />
        <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" />
        <button type="submit">Join Team</button>
      </form>

      <button onClick={onStop} disabled={!state?.current_round || !teamId}>
        STOP
      </button>

      <button onClick={onToggleReady} disabled={!joinedPlayerId}>
        {playerReady ? 'Set Not Ready' : 'Set Ready'}
      </button>

      <form onSubmit={onGuess}>
        <input value={guessTitle} onChange={(e) => setGuessTitle(e.target.value)} placeholder="Song title" />
        <input value={guessArtist} onChange={(e) => setGuessArtist(e.target.value)} placeholder="Artist" />
        <button type="submit" disabled={!state?.current_round?.can_guess || !teamId}>
          Submit Guess
        </button>
      </form>

      {state?.current_round && <p>Round status: {state.current_round.status}</p>}
      {joinedPlayerId && <p>Status: {playerReady ? 'Ready' : 'Not ready'}</p>}
      {state?.message && <p>{state.message}</p>}
      {error && <p>{error}</p>}
    </main>
  );
}
