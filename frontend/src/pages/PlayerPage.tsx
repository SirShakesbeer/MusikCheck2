import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button, Card, Field, StatusChip } from '../components/ui';
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
      <Card>
        <StatusChip>Player Panel</StatusChip>
        <h1 className="page-heading mt-2">Player</h1>
        <p className="page-subheading">Lobby: {code}</p>

        <form onSubmit={onJoin} className="player-form-grid">
          <Field label="Player Name" className="min-w-0">
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Player name" />
          </Field>
          <Field label="Team Name" className="min-w-0">
            <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" />
          </Field>
          <div className="full">
            <Button type="submit" className="w-full sm:w-auto">Join Team</Button>
          </div>
        </form>
      </Card>

      <Card title="Round Actions">
        <div className="host-actions-grid mb-3">
          <Button onClick={onStop} disabled={!state?.current_round || !teamId} variant="ghost" className="w-full sm:w-auto">
            Stop
          </Button>
          <Button onClick={onToggleReady} disabled={!joinedPlayerId} variant="secondary" className="w-full sm:w-auto">
            {playerReady ? 'Set Not Ready' : 'Set Ready'}
          </Button>
        </div>

        <form onSubmit={onGuess} className="player-form-grid">
          <Field label="Guess Title" className="min-w-0">
            <input value={guessTitle} onChange={(e) => setGuessTitle(e.target.value)} placeholder="Song title" />
          </Field>
          <Field label="Guess Artist" className="min-w-0">
            <input value={guessArtist} onChange={(e) => setGuessArtist(e.target.value)} placeholder="Artist" />
          </Field>
          <div className="full">
            <Button type="submit" disabled={!state?.current_round?.can_guess || !teamId} className="w-full sm:w-auto">
              Submit Guess
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Live Status">
        {state?.current_round && <p className="muted-copy">Round status: {state.current_round.status}</p>}
        {joinedPlayerId && <p className="muted-copy">Status: {playerReady ? 'Ready' : 'Not ready'}</p>}
        {state?.message && <StatusChip className="mt-2">{state.message}</StatusChip>}
        {error && <p className="danger-text mt-2">{error}</p>}
      </Card>
    </main>
  );
}
