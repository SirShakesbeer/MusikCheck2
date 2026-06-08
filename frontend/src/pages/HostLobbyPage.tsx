import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { TeamProgressBoard } from '../components/TeamProgressBoard';
import { Button, Card, StatusChip } from '../components/ui';
import { API_BASE_URL } from '../config/defaults';
import { DEFAULT_SCOREBOARD_MAX_POINTS } from '../config/defaults';
import { useTranslation } from '../i18n/useTranslation';
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
  const { t } = useTranslation();

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
  const [videoPreviewFrameIndex, setVideoPreviewFrameIndex] = useState<number>(0);
  const lastPlaybackTokenRef = useRef<number>(0);

  const applyUiError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('expired')) {
      setSessionExpired(true);
      setError(t('hostSetup.sessionExpiredLong'));
      return;
    }
    setError(message);
  };

  const stopAllPlayback = () => {
    playbackDispatcher.stop();
  };

  const applyRoundUpdate = (nextState: GameState, targetStageIndex: number) => {
    const nextRound = nextState.current_round;
    if (nextRound?.round_kind === 'video' && nextRound.video_playback) {
      setVideoPreviewRound(nextRound);
      setVideoPreviewStageIndex(targetStageIndex);
      setVideoPreviewOpen(true);
    }

    setState(nextState);
    setError(null);
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

        applyRoundUpdate(result.data, targetStageIndex);
        return;
      }

      if (state.current_round.status === 'finished') {
        return;
      }

      const result = await api.playRoundStage(code, targetStageIndex);

      applyRoundUpdate(result.data, targetStageIndex);
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
          <h1 className="page-heading">{t('hostLobby.sessionExpiredTitle')}</h1>
          <p className="danger-text">{error || t('hostLobby.sessionExpiredMessage')}</p>
          <div className="source-row mt-3">
            <Button onClick={() => navigate('/')}>{t('hostLobby.exit')}</Button>
          </div>
        </header>
      </main>
    );
  }

  const hasWinnerLock = Boolean(state?.has_winner_lock);
  const winnerTeamIds = new Set(state?.winner_team_ids ?? []);
  const previewPlayback = videoPreviewRound?.video_playback ?? null;
  const backendOrigin = useMemo(() => {
    try {
      return new URL(API_BASE_URL).origin;
    } catch {
      return window.location.origin;
    }
  }, []);

  const resolveMediaUrl = (rawUrl: string | null | undefined): string | null => {
    if (!rawUrl) {
      return null;
    }
    if (/^https?:\/\//i.test(rawUrl) || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
      return rawUrl;
    }
    if (rawUrl.startsWith('/')) {
      return `${backendOrigin}${rawUrl}`;
    }
    return `${backendOrigin}/${rawUrl}`;
  };

  const previewFrameList = (previewPlayback?.frame_urls ?? [])
    .map((url) => resolveMediaUrl(url))
    .filter((url): url is string => Boolean(url));
  const previewFrame = previewFrameList[videoPreviewFrameIndex] ?? previewFrameList[0] ?? null;
  const previewClipUrl = resolveMediaUrl(previewPlayback?.clip_url ?? null);
  const previewClipIsExtractedAsset = Boolean(previewClipUrl && previewClipUrl.includes('/api/media/snippets/'));

  useEffect(() => {
    if (!videoPreviewOpen) {
      return;
    }
    const startIndex = Math.max(0, Math.min(videoPreviewStageIndex, Math.max(0, previewFrameList.length - 1)));
    setVideoPreviewFrameIndex(startIndex);
  }, [videoPreviewOpen, videoPreviewStageIndex, previewFrameList.length]);

  useEffect(() => {
    if (!videoPreviewOpen || !previewPlayback || previewPlayback.mode !== 'frame_loop') {
      return;
    }
    if (previewFrameList.length < 2) {
      return;
    }

    const durationMs = Math.max(220, previewPlayback.frame_duration_ms ?? 600);
    const timer = window.setInterval(() => {
      setVideoPreviewFrameIndex((current) => (current + 1) % previewFrameList.length);
    }, durationMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [videoPreviewOpen, previewPlayback, previewFrameList]);

  return (
    <main className="host-lobby-shell">
      <header className="host-lobby-header paper-card">
        <h1 className="page-heading">{t('app.title')}</h1>
        <Button
          variant="ghost"
          onClick={() => {
            resetSetup();
            navigate('/');
          }}
        >
          {t('hostLobby.exit')}
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
          roundFinished={state?.current_round?.status === 'finished'}
          maxPoints={state?.mode?.required_points_to_win ?? DEFAULT_SCOREBOARD_MAX_POINTS}
          winnerTeamIds={winnerTeamIds}
          hasWinnerLock={hasWinnerLock}
          onToggleFact={onToggleFact}
          onPenalty={onPenalty}
        />
      </section>

      {finishGameOpen && (
        <div className="finish-game-overlay" role="dialog" aria-modal="true" aria-label={t('hostLobby.gameFinished')}>
          <Card title={t('hostLobby.gameFinished')} tone="panel" className="finish-game-card">
            {finishGameStats ? (
              <>
                <p className="muted-copy mb-1">
                  {t('hostLobby.winners', {
                    names: finishGameStats.winner_team_names.length > 0 ? finishGameStats.winner_team_names.join(', ') : t('hostLobby.unknown'),
                  })}
                </p>
                <p className="muted-copy mb-3">
                  {t('hostLobby.statsLine', {
                    songs: finishGameStats.total_songs_played,
                    players: finishGameStats.total_players,
                    topScore: finishGameStats.top_score,
                    averageScore: finishGameStats.average_score,
                  })}
                </p>

                <div className="finish-stats-grid mb-3">
                  <div>
                    <span className="muted-copy">{t('hostLobby.targetScore')}</span>
                    <p>{finishGameStats.required_points_to_win}</p>
                  </div>
                  <div>
                    <span className="muted-copy">{t('hostLobby.totalPoints')}</span>
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
              <p className="muted-copy mb-2">{t('hostLobby.noStatsAvailable')}</p>
            )}

            <p className="muted-copy mb-3">{t('hostLobby.chooseNext')}</p>
            <div className="host-actions-grid">
              <Button
                onClick={() => {
                  onCloseFinishGame();
                  navigate('/');
                }}
              >
                {t('hostLobby.goToHome')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void onSetupSameLobby()}
                disabled={resettingForNewGame}
              >
                {resettingForNewGame ? t('hostLobby.preparingNewGame') : t('hostLobby.setupSameLobby')}
              </Button>
              <Button variant="ghost" onClick={onCloseFinishGame} disabled={resettingForNewGame}>{t('hostLobby.cancel')}</Button>
            </div>
          </Card>
        </div>
      )}

      {videoPreviewOpen && previewPlayback && (
        <div
          className="video-round-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('hostLobby.videoRoundPreview')}
          onClick={() => setVideoPreviewOpen(false)}
        >
          <div className="video-round-popup">
            {previewPlayback.mode === 'video_clip' && previewPlayback.clip_url ? (
              previewClipIsExtractedAsset ? (
                <video
                  src={previewClipUrl ?? undefined}
                  title={t('hostLobby.videoSnippetPreview')}
                  className="video-round-frame"
                  autoPlay
                  controls
                  playsInline
                />
              ) : (
                <iframe
                  src={previewClipUrl ?? undefined}
                  title={t('hostLobby.videoSnippetPreview')}
                  className="video-round-frame"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              )
            ) : (
              previewFrame && <img src={previewFrame} alt={t('hostLobby.videoScreenshot')} className="video-round-frame" />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
