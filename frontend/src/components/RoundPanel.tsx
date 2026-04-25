import { AnimatePresence, motion } from 'framer-motion';

import { DEFAULT_ROUND_STAGE_COUNT, PAPER_BUTTON_ANIMATION_DEFAULTS, UNKNOWN_REVEAL_VALUE } from '../config/defaults';
import type { RoundState } from '../types';
import { Button, StatusChip } from './ui';

type Props = {
  round: RoundState | null;
  onStart: () => void;
  onPlaySnippet: (stageIndex: number) => void;
  onNextRound: () => void;
  onRevealRound: () => void;
  onFinishGame: () => void;
  hasWinnerLock: boolean;
  finishGameLoading?: boolean;
};

export function RoundPanel({
  round,
  onStart,
  onPlaySnippet,
  onNextRound,
  onRevealRound,
  onFinishGame,
  hasWinnerLock,
  finishGameLoading = false,
}: Props) {
  const isFinished = round?.status === 'finished';
  const stageCount = round?.snippet_start_offsets?.length || DEFAULT_ROUND_STAGE_COUNT;
  const mustRevealBeforeFinish = hasWinnerLock && !isFinished;
  const roundKey = round?.song_number ?? -1;

  const getButtonState = (targetStage: number): { disabled: boolean; label: string } => {
    if (!round) {
      return { disabled: targetStage !== 0, label: `Snippet ${targetStage + 1}` };
    }
    return { disabled: false, label: `Snippet ${targetStage + 1}` };
  };

  return (
    <div className="round-controls-stage">
      {!round ? (
        <div className="round-actions-row">
          <Button onClick={onStart}>Start Round</Button>
        </div>
      ) : (
        <div className="round-controls-shell">
          <div className="round-controls-row">
            <div className="round-snippet-stage">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={roundKey}
                  className="round-snippet-row"
                  initial={{ opacity: 0, y: -24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 42, scale: 0.82, rotate: 8, filter: 'blur(1px)' }}
                  transition={{
                    duration: PAPER_BUTTON_ANIMATION_DEFAULTS.roundSlideInDurationMs / 1000,
                  }}
                >
                  {Array.from({ length: stageCount }, (_, stage) => stage).map((stage) => {
                    const state = getButtonState(stage);
                    return (
                      <Button
                        key={stage}
                        disabled={state.disabled || isFinished || mustRevealBeforeFinish}
                        onClick={() => onPlaySnippet(stage)}
                        variant="ghost"
                        morphAnimationEnabled
                      >
                        {state.label}
                      </Button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="round-static-row">
              <Button onClick={onRevealRound} disabled={isFinished} variant="secondary">
                Reveal
              </Button>
              {hasWinnerLock ? (
                <Button onClick={onFinishGame} disabled={mustRevealBeforeFinish || finishGameLoading}>
                  {finishGameLoading ? 'Loading Stats...' : 'Finish Game'}
                </Button>
              ) : (
                <Button onClick={onNextRound}>Next Round</Button>
              )}
            </div>
          </div>
          {mustRevealBeforeFinish && (
            <p className="muted-copy mt-2">A team reached the maximum score. Reveal first, then finish or deduct points.</p>
          )}
          <AnimatePresence>
            {isFinished && (round.reveal_artist || round.reveal_title || round.reveal_source) && (
              <motion.div
                className="reveal-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <p><strong>Artist:</strong> {round.reveal_artist || UNKNOWN_REVEAL_VALUE}</p>
                <p><strong>Title:</strong> {round.reveal_title || UNKNOWN_REVEAL_VALUE}</p>
                <p><strong>Source:</strong> {round.reveal_source || round.playback_provider}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
