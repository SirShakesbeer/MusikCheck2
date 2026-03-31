import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { Scoreboard } from '../components/Scoreboard';
import { api } from '../services/api';
import { RoundPlaybackDispatcher } from '../services/playbackDispatcher';
import { connectLobbySocket } from '../services/ws';
import { useHostSetupStore } from '../stores/hostSetupStore';
import type { GameState, RoundTeamState } from '../types';

export function HostLobbyPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { resetSetup } = useHostSetupStore();
  const playbackDispatcher = useMemo(
    () => new RoundPlaybackDispatcher((deviceId) => setSpotifyDeviceId(deviceId)),
    [],
  );

  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const lastPlaybackTokenRef = useRef<number>(0);

  const stopAllPlayback = () => {
    playbackDispatcher.stop();
  };

  useEffect(() => {
    if (!code) return;

    const load = async () => {
      try {
        const result = await api.getLobbyState(code);
        setState(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void load();
  }, [code]);

  useEffect(() => {
    const loadSpotifyStatus = async () => {
      try {
        const status = await api.getSpotifyStatus();
        setSpotifyConnected(Boolean(status.data.connected));
      } catch {
      }
    };

    void loadSpotifyStatus();
  }, []);

  useEffect(() => {
    if (!code) return;
    return connectLobbySocket(code, setState);
  }, [code]);

  useEffect(() => {
    const round = state?.current_round;
    if (!round) {
      lastPlaybackTokenRef.current = 0;
      stopAllPlayback();
      return;
    }

    if (round.status !== 'playing') {
      stopAllPlayback();
      return;
    }

    if (round.playback_token === lastPlaybackTokenRef.current) {
      return;
    }

    lastPlaybackTokenRef.current = round.playback_token;
    void playbackDispatcher.playRound(round).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [playbackDispatcher, state?.current_round]);

  useEffect(() => {
    return () => {
      stopAllPlayback();
      playbackDispatcher.dispose();
    };
  }, [playbackDispatcher]);

  const teamRoundGuessState = useMemo<Record<string, RoundTeamState>>(() => {
    const entries = (state?.round_team_states ?? []).map((teamState) => [teamState.team_id, teamState] as const);
    return Object.fromEntries(entries);
  }, [state?.round_team_states]);

  const onStartRound = async () => {
    try {
      const result = await api.startRound(code);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onPlaySnippet = async (targetStageIndex: number) => {
    try {
      if (!state?.current_round) {
        if (targetStageIndex !== 0) {
          return;
        }
        await api.startRound(code);
        const result = await api.playRoundStage(code, 0);
        setState(result.data);
        setError(null);
        return;
      }

      if (state.current_round.status === 'finished') {
        return;
      }

      const result = await api.playRoundStage(code, targetStageIndex);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onRevealRound = async () => {
    try {
      if (!state?.current_round || state.current_round.status === 'finished') {
        return;
      }
      const result = await api.finishRound(code);
      setState(result.data);
      stopAllPlayback();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onNextRound = async () => {
    try {
      const result = await api.nextRound(code);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onToggleFact = async (teamId: string, fact: 'artist' | 'title') => {
    try {
      const result = await api.toggleRoundFact(code, teamId, fact);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onPenalty = async (teamId: string) => {
    try {
      const result = await api.applyWrongGuessPenalty(code, teamId);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main>
      <h1>MusikCheck2 Lobby</h1>
      <p>Lobby: {code}</p>
      <p>Spotify playback: {spotifyConnected ? 'Connected' : 'Not connected'}</p>
      {spotifyDeviceId && <p>Spotify device: {spotifyDeviceId}</p>}

      <div className="source-row">
        <button
          onClick={() => {
            resetSetup();
            navigate('/host/setup');
          }}
        >
          Back To Setup
        </button>
      </div>

      {state?.message && <p>{state.message}</p>}

      <RoundPanel
        round={state?.current_round ?? null}
        onStart={onStartRound}
        onPlaySnippet={onPlaySnippet}
        onNextRound={onNextRound}
        onRevealRound={onRevealRound}
      />

      <section>
        <h3>Teams</h3>
        {state?.teams?.length ? (
          <div className="source-list">
            {state.teams.map((team) => {
              const roundState = teamRoundGuessState[team.id];
              return (
                <div key={team.id} className="source-row">
                  <strong>{team.name}</strong>
                  <span>Score: {team.score}</span>
                  {roundState && (
                    <span>
                      Artist {roundState.artist_points} / Title {roundState.title_points} / Bonus {roundState.bonus_points}
                    </span>
                  )}
                  <button onClick={() => onToggleFact(team.id, 'artist')}>Toggle Artist</button>
                  <button onClick={() => onToggleFact(team.id, 'title')}>Toggle Title</button>
                  <button onClick={() => onPenalty(team.id)}>Wrong Guess Penalty</button>
                </div>
              );
            })}
          </div>
        ) : (
          <p>No teams available yet.</p>
        )}
      </section>

      <section>
        <h3>Players</h3>
        {state?.players?.length ? (
          <ul>
            {state.players.map((player) => (
              <li key={player.id}>
                {player.name} ({player.ready ? 'ready' : 'not ready'})
              </li>
            ))}
          </ul>
        ) : (
          <p>No connected players yet.</p>
        )}
      </section>

      <Scoreboard teams={state?.teams ?? []} maxPoints={state?.mode?.required_points_to_win ?? 1} />

      {error && <p>{error}</p>}
    </main>
  );
}
