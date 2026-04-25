import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { Scoreboard } from '../components/Scoreboard';
import { ThemeSelector } from '../components/ThemeSwitcher';
import { Button, Card, StatusChip } from '../components/ui';
import { DEFAULT_SCOREBOARD_MAX_POINTS, VIDEO_SNIPPET2_FRAME_DURATION_MS } from '../config/defaults';
import { api } from '../services/api';
import { RoundPlaybackDispatcher } from '../services/playbackDispatcher';
import { connectLobbySocket } from '../services/ws';
import { useHostSetupStore } from '../stores/hostSetupStore';
import type { FinishGameStatsState, GameState, RoundState, RoundTeamState } from '../types';


function HostVideoStagePreview({ round }: { round: RoundState | null }) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [clipVisible, setClipVisible] = useState(true);
  const videoPlayback = round?.video_playback ?? null;

  useEffect(() => {
    setFrameIndex(0);
    setClipVisible(true);
  }, [round?.playback_token, round?.stage_index, videoPlayback?.mode]);

  useEffect(() => {
    if (!round || round.status !== 'playing') {
      return;
    }
    if (round.round_kind !== 'video') {
      return;
    }
    if (!videoPlayback || videoPlayback.mode !== 'frame_loop') {
      return;
    }
    const frames = videoPlayback.frame_urls ?? [];
    if (frames.length < 2) {
      return;
    }

    const durationMs = Math.max(250, videoPlayback.frame_duration_ms ?? VIDEO_SNIPPET2_FRAME_DURATION_MS);
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, durationMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [round, videoPlayback]);

  useEffect(() => {
    if (!round || round.status !== 'playing') {
      return;
    }
    if (round.round_kind !== 'video') {
      return;
    }
    if (!videoPlayback || videoPlayback.mode !== 'video_clip') {
      return;
    }

    const clipDuration = Math.max(1, videoPlayback.clip_duration_seconds ?? round.stage_playback.duration_seconds);
    const timer = window.setTimeout(() => {
      setClipVisible(false);
    }, clipDuration * 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [round, videoPlayback]);

  if (!round || round.round_kind !== 'video' || !videoPlayback) {
    return null;
  }

  if (videoPlayback.mode === 'video_clip' && videoPlayback.clip_url && clipVisible) {
    return (
      <Card title="Video Snippet">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/50">
          <iframe
            key={`${round.playback_token}-${round.stage_index}`}
            src={videoPlayback.clip_url}
            title="Video snippet clip"
            className="aspect-video w-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      </Card>
    );
  }

  const frames = videoPlayback.frame_urls ?? [];
  const activeFrame = frames[frameIndex] ?? frames[0];
  if (!activeFrame) {
    return null;
  }

  return (
    <Card title="Video Snippet">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/50">
        <img
          key={`${round.playback_token}-${round.stage_index}-${frameIndex}`}
          src={activeFrame}
          alt="Round video frame"
          className="aspect-video w-full object-cover"
        />
      </div>
      {videoPlayback.mode === 'frame_loop' && (
        <p className="muted-copy mt-2">
          Looping {frames.length} frames every {videoPlayback.frame_duration_ms ?? VIDEO_SNIPPET2_FRAME_DURATION_MS} ms.
        </p>
      )}
    </Card>
  );
}

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
  const [finishGameOpen, setFinishGameOpen] = useState<boolean>(false);
  const [finishGameLoading, setFinishGameLoading] = useState<boolean>(false);
  const [resettingForNewGame, setResettingForNewGame] = useState<boolean>(false);
  const [finishGameStats, setFinishGameStats] = useState<FinishGameStatsState | null>(null);
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
      lastPlaybackTokenRef.current = 0;
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
        if (result.data.current_round?.status === 'playing') {
          lastPlaybackTokenRef.current = result.data.current_round.playback_token;
          void playbackDispatcher.playRound(result.data.current_round).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
          });
        }
        setState(result.data);
        setError(null);
        return;
      }

      if (state.current_round.status === 'finished') {
        return;
      }

      const result = await api.playRoundStage(code, targetStageIndex);
      if (result.data.current_round?.status === 'playing') {
        lastPlaybackTokenRef.current = result.data.current_round.playback_token;
        void playbackDispatcher.playRound(result.data.current_round).catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        });
      }
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

  const onFinishGame = async () => {
    try {
      setFinishGameLoading(true);
      const result = await api.finishGame(code);
      setFinishGameStats(result.data);
      setFinishGameOpen(true);
      setError(null);
    } catch (err) {
      applyUiError(err);
    } finally {
      setFinishGameLoading(false);
    }
  };

  const onCloseFinishGame = () => {
    if (resettingForNewGame) {
      return;
    }
    setFinishGameOpen(false);
    setFinishGameStats(null);
  };

  const onSetupSameLobby = async () => {
    try {
      setResettingForNewGame(true);
      const result = await api.resetGame(code);
      setState(result.data);
      setFinishGameOpen(false);
      setFinishGameStats(null);
      navigate(`/host/setup/${code}`);
    } catch (err) {
      applyUiError(err);
    } finally {
      setResettingForNewGame(false);
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

  const hasWinnerLock = Boolean(state?.has_winner_lock);
  const winnerTeamIds = new Set(state?.winner_team_ids ?? []);

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
        <div
          className="options-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Game options"
          onClick={() => setOptionsOpen(false)}
        >
          <Card
            title="Options"
            tone="panel"
            className="options-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="options-section mb-3">
              <p className="options-section-title">Style</p>
              <ThemeSelector className="options-theme-selector" label="Theme" selectClassName="options-theme-select" />
            </div>

            <div className="options-section mb-3">
              <p className="options-section-title">Integrations</p>
              <div className="host-actions-grid">
                <Button onClick={connectSpotify} disabled={spotifyAuthBusy}>
                  {spotifyAuthBusy ? 'Connecting Spotify...' : (spotifyConnected ? 'Reconnect Spotify' : 'Connect Spotify')}
                </Button>
              </div>
            </div>

            <div className="host-actions-grid">
              <Button variant="ghost" onClick={() => setOptionsOpen(false)}>Close</Button>
            </div>
          </Card>
        </div>
      )}

      {state?.message && <StatusChip>{state.message}</StatusChip>}

      <HostVideoStagePreview round={state?.current_round ?? null} />

      <RoundPanel
        round={state?.current_round ?? null}
        onStart={onStartRound}
        onPlaySnippet={onPlaySnippet}
        onNextRound={onNextRound}
        onRevealRound={onRevealRound}
        onFinishGame={() => void onFinishGame()}
        hasWinnerLock={hasWinnerLock}
        finishGameLoading={finishGameLoading}
      />

      <Card title="Teams">
        {state?.teams?.length ? (
          <div className="source-list">
            {state.teams.map((team) => {
              const roundState = teamRoundGuessState[team.id];
              const artistSelected = (roundState?.artist_points ?? 0) > 0;
              const titleSelected = (roundState?.title_points ?? 0) > 0;
              const disableArtistToggle = hasWinnerLock && !artistSelected;
              const disableTitleToggle = hasWinnerLock && !titleSelected;
              return (
                <div key={team.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <strong className="text-lg">{team.name}</strong>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StatusChip>Score: {team.score}</StatusChip>
                      {winnerTeamIds.has(team.id) && <StatusChip tone="ok">Max Reached</StatusChip>}
                    </div>
                  </div>
                  {roundState && (
                    <p className="muted-copy mb-2">
                      Artist {roundState.artist_points} / Title {roundState.title_points} / Bonus {roundState.bonus_points}
                    </p>
                  )}
                  <div className="host-actions-grid">
                    <Button
                      onClick={() => onToggleFact(team.id, 'artist')}
                      disabled={disableArtistToggle}
                      variant="ghost"
                      size="sm"
                    >
                      Toggle Artist
                    </Button>
                    <Button
                      onClick={() => onToggleFact(team.id, 'title')}
                      disabled={disableTitleToggle}
                      variant="ghost"
                      size="sm"
                    >
                      Toggle Title
                    </Button>
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

      <Scoreboard teams={state?.teams ?? []} maxPoints={state?.mode?.required_points_to_win ?? DEFAULT_SCOREBOARD_MAX_POINTS} />

      {finishGameOpen && (
        <div className="finish-game-overlay" role="dialog" aria-modal="true" aria-label="Finish game dialog">
          <Card title="Game Finished" tone="panel" className="finish-game-card">
            {finishGameStats ? (
              <>
                <p className="muted-copy mb-1">
                  Winners: {finishGameStats.winner_team_names.length > 0 ? finishGameStats.winner_team_names.join(', ') : 'Unknown'}
                </p>
                <p className="muted-copy mb-3">
                  Songs {finishGameStats.total_songs_played} • Players {finishGameStats.total_players} • Top Score {finishGameStats.top_score} • Avg Score {finishGameStats.average_score}
                </p>

                <div className="finish-stats-grid mb-3">
                  <div>
                    <span className="muted-copy">Target Score</span>
                    <p>{finishGameStats.required_points_to_win}</p>
                  </div>
                  <div>
                    <span className="muted-copy">Total Points</span>
                    <p>{finishGameStats.total_points_awarded}</p>
                  </div>
                </div>

                <div className="finish-team-list mb-3">
                  {finishGameStats.teams.map((team) => (
                    <div key={team.team_id} className="finish-team-row">
                      <strong>#{team.rank} {team.team_name}</strong>
                      <div className="flex items-center gap-2">
                        <StatusChip>Score: {team.score}</StatusChip>
                        {team.is_winner && <StatusChip tone="ok">Winner</StatusChip>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted-copy mb-2">No statistics available.</p>
            )}

            <p className="muted-copy mb-3">Choose what to do next:</p>
            <div className="host-actions-grid">
              <Button
                onClick={() => {
                  onCloseFinishGame();
                  navigate('/');
                }}
              >
                Go To Home
              </Button>
              <Button
                variant="secondary"
                onClick={() => void onSetupSameLobby()}
                disabled={resettingForNewGame}
              >
                {resettingForNewGame ? 'Preparing New Game...' : 'Setup Same Lobby'}
              </Button>
              <Button variant="ghost" onClick={onCloseFinishGame} disabled={resettingForNewGame}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}

      {error && <p className="danger-text">{error}</p>}
    </main>
  );
}
