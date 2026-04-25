import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { TeamProgressBoard } from '../components/TeamProgressBoard';
import { Button, Card, StatusChip } from '../components/ui';
import { DEFAULT_SCOREBOARD_MAX_POINTS } from '../config/defaults';
import { api } from '../services/api';
import { RoundPlaybackDispatcher } from '../services/playbackDispatcher';
import { connectLobbySocket } from '../services/ws';
import { useHostSetupStore } from '../stores/hostSetupStore';
import type { FinishGameStatsState, GameState, RoundState, RoundTeamState } from '../types';

export function HostLobbyPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { resetSetup } = useHostSetupStore();
  const playbackDispatcher = useMemo(() => new RoundPlaybackDispatcher(() => {}), []);

  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [finishGameOpen, setFinishGameOpen] = useState<boolean>(false);
  const [finishGameLoading, setFinishGameLoading] = useState<boolean>(false);
  const [resettingForNewGame, setResettingForNewGame] = useState<boolean>(false);
  const [finishGameStats, setFinishGameStats] = useState<FinishGameStatsState | null>(null);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState<boolean>(false);
  const [videoPreviewRound, setVideoPreviewRound] = useState<RoundState | null>(null);
  const [videoPreviewStageIndex, setVideoPreviewStageIndex] = useState<number>(0);
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

        if (result.data.current_round?.round_kind === 'video' && result.data.current_round.video_playback) {
          setVideoPreviewRound(result.data.current_round);
          setVideoPreviewStageIndex(targetStageIndex);
          setVideoPreviewOpen(true);
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

      if (result.data.current_round?.round_kind === 'video' && result.data.current_round.video_playback) {
        setVideoPreviewRound(result.data.current_round);
        setVideoPreviewStageIndex(targetStageIndex);
        setVideoPreviewOpen(true);
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
      setVideoPreviewOpen(false);
      setVideoPreviewRound(null);
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
      <main className="host-lobby-shell">
        <header className="host-lobby-header paper-card">
          <h1 className="page-heading">Session Expired</h1>
          <p className="danger-text">{error || 'This lobby is no longer available.'}</p>
          <div className="source-row mt-3">
            <Button onClick={() => navigate('/')}>Exit</Button>
          </div>
        </header>
      </main>
    );
  }

  const hasWinnerLock = Boolean(state?.has_winner_lock);
  const winnerTeamIds = new Set(state?.winner_team_ids ?? []);
  const previewPlayback = videoPreviewRound?.video_playback ?? null;
  const previewFrameList = previewPlayback?.frame_urls ?? [];
  const previewFrameIndex = Math.max(0, Math.min(videoPreviewStageIndex, Math.max(0, previewFrameList.length - 1)));
  const previewFrame = previewFrameList[previewFrameIndex] ?? previewFrameList[0] ?? null;

  return (
    <main className="host-lobby-shell">
      <header className="host-lobby-header paper-card">
        <h1 className="page-heading">MusikCheck 2</h1>
        <Button
          variant="ghost"
          onClick={() => {
            resetSetup();
            navigate('/');
          }}
        >
          Exit
        </Button>
      </header>

      {error && <p className="danger-text host-lobby-error">{error}</p>}

      <div className="host-lobby-controls">
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
      </div>

      <section className="host-lobby-board">
        <TeamProgressBoard
          teams={state?.teams ?? []}
          roundStates={teamRoundGuessState}
          maxPoints={state?.mode?.required_points_to_win ?? DEFAULT_SCOREBOARD_MAX_POINTS}
          winnerTeamIds={winnerTeamIds}
          hasWinnerLock={hasWinnerLock}
          onToggleFact={onToggleFact}
          onPenalty={onPenalty}
        />
      </section>

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

      {videoPreviewOpen && previewPlayback && (
        <div
          className="video-round-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Video round preview"
          onClick={() => setVideoPreviewOpen(false)}
        >
          <div className="video-round-popup">
            {previewPlayback.mode === 'video_clip' && previewPlayback.clip_url ? (
              <iframe
                src={previewPlayback.clip_url}
                title="Video snippet preview"
                className="video-round-frame"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              previewFrame && <img src={previewFrame} alt="Video round screenshot" className="video-round-frame" />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
