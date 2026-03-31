import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { Scoreboard } from '../components/Scoreboard';
import { Button, Card, StatusChip } from '../components/ui';
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
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyAuthBusy, setSpotifyAuthBusy] = useState<boolean>(false);
  const [optionsOpen, setOptionsOpen] = useState<boolean>(false);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const lastPlaybackTokenRef = useRef<number>(0);

  const applyUiError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('expired')) {
      setSessionExpired(true);
      setError('This session has expired after 24 hours. Start a new lobby to continue.');
      return;
    }
    setError(message);
  };

  const stopAllPlayback = () => {
    playbackDispatcher.stop();
  };

  useEffect(() => {
    if (!code) return;

    const load = async () => {
      try {
        const result = await api.getLobbyState(code);
        setState(result.data);
        setSessionExpired(false);
      } catch (err) {
        applyUiError(err);
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
      applyUiError(err);
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
      applyUiError(err);
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
      applyUiError(err);
    }
  };

  const onNextRound = async () => {
    try {
      const result = await api.nextRound(code);
      setState(result.data);
      setError(null);
    } catch (err) {
      applyUiError(err);
    }
  };

  const onToggleFact = async (teamId: string, fact: 'artist' | 'title') => {
    try {
      const result = await api.toggleRoundFact(code, teamId, fact);
      setState(result.data);
      setError(null);
    } catch (err) {
      applyUiError(err);
    }
  };

  const onPenalty = async (teamId: string) => {
    try {
      const result = await api.applyWrongGuessPenalty(code, teamId);
      setState(result.data);
      setError(null);
    } catch (err) {
      applyUiError(err);
    }
  };

  if (sessionExpired) {
    return (
      <main>
        <Card>
          <h1 className="page-heading">Session Expired</h1>
          <p className="danger-text">{error || 'This lobby is no longer available.'}</p>
          <div className="source-row mt-3">
            <Button onClick={() => navigate('/')}>Go To Home</Button>
          </div>
        </Card>
      </main>
    );
  }

  const connectSpotify = async () => {
    setSpotifyAuthBusy(true);
    try {
      const auth = await api.getSpotifyAuthUrl();
      const popup = window.open(auth.data.auth_url, 'spotify-oauth', 'width=520,height=720,resizable=yes');
      if (!popup) {
        throw new Error('Popup was blocked. Please allow popups for Spotify login.');
      }

      const startedAt = Date.now();
      const intervalId = window.setInterval(async () => {
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs > 120000) {
          window.clearInterval(intervalId);
          setSpotifyAuthBusy(false);
          return;
        }

        try {
          const status = await api.getSpotifyStatus();
          if (status.data.connected) {
            setSpotifyConnected(true);
            await api.setLobbySpotifyConnection(code, true);
            setSpotifyAuthBusy(false);
            window.clearInterval(intervalId);
            if (!popup.closed) {
              popup.close();
            }
          }
        } catch {
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSpotifyAuthBusy(false);
    }
  };

  return (
    <main>
      <Card>
        <StatusChip>Live Lobby</StatusChip>
        <h1 className="page-heading mt-2">MusikCheck2 Lobby</h1>
        <p className="page-subheading">Lobby: {code}</p>
        <div className="source-row-mobile mb-2">
          <StatusChip tone={spotifyConnected ? 'ok' : 'warn'}>Spotify {spotifyConnected ? 'Connected' : 'Not Connected'}</StatusChip>
          {spotifyDeviceId && <StatusChip>Device {spotifyDeviceId}</StatusChip>}
        </div>

        <div className="host-actions-grid">
          <Button onClick={() => setOptionsOpen((current) => !current)} variant="ghost">
            Options
          </Button>
          <Button
            onClick={() => {
              resetSetup();
              navigate(`/host/setup/${code}`);
            }}
          >
            Back To Setup
          </Button>
        </div>
      </Card>

      {optionsOpen && (
        <Card title="Options" tone="panel">
          <div className="host-actions-grid mb-1">
            <Button onClick={connectSpotify} disabled={spotifyAuthBusy}>
              {spotifyAuthBusy ? 'Connecting Spotify...' : (spotifyConnected ? 'Reconnect Spotify' : 'Connect Spotify')}
            </Button>
          </div>
        </Card>
      )}

      {state?.message && <StatusChip>{state.message}</StatusChip>}

      <RoundPanel
        round={state?.current_round ?? null}
        onStart={onStartRound}
        onPlaySnippet={onPlaySnippet}
        onNextRound={onNextRound}
        onRevealRound={onRevealRound}
      />

      <Card title="Teams">
        {state?.teams?.length ? (
          <div className="source-list">
            {state.teams.map((team) => {
              const roundState = teamRoundGuessState[team.id];
              return (
                <div key={team.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <strong className="text-lg">{team.name}</strong>
                    <StatusChip>Score: {team.score}</StatusChip>
                  </div>
                  {roundState && (
                    <p className="muted-copy mb-2">
                      Artist {roundState.artist_points} / Title {roundState.title_points} / Bonus {roundState.bonus_points}
                    </p>
                  )}
                  <div className="host-actions-grid">
                    <Button onClick={() => onToggleFact(team.id, 'artist')} variant="ghost" size="sm">Toggle Artist</Button>
                    <Button onClick={() => onToggleFact(team.id, 'title')} variant="ghost" size="sm">Toggle Title</Button>
                    <Button onClick={() => onPenalty(team.id)} variant="danger" size="sm">Wrong Guess Penalty</Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p>No teams available yet.</p>
        )}
      </Card>

      <Card title="Players">
        {state?.players?.length ? (
          <ul className="space-y-2 pl-0">
            {state.players.map((player) => (
              <li key={player.id} className="list-none rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                {player.name} ({player.ready ? 'ready' : 'not ready'})
              </li>
            ))}
          </ul>
        ) : (
          <p>No connected players yet.</p>
        )}
      </Card>

      <Scoreboard teams={state?.teams ?? []} maxPoints={state?.mode?.required_points_to_win ?? 1} />

      {error && <p className="danger-text">{error}</p>}
    </main>
  );
}
