import { AnimatePresence, motion } from 'framer-motion';

import type { RoundState } from '../types';
import { Button, Card, StatusChip } from './ui';

type Props = {
  round: RoundState | null;
  onStart: () => void;
  onPlaySnippet: (stageIndex: number) => void;
  onNextRound: () => void;
  onRevealRound: () => void;
};

export function RoundPanel({ round, onStart, onPlaySnippet, onNextRound, onRevealRound }: Props) {
  const isFinished = round?.status === 'finished';
  const stageCount = round?.snippet_start_offsets?.length || 3;

  const getButtonState = (targetStage: number): { disabled: boolean; label: string } => {
    if (!round) {
      return { disabled: targetStage !== 0, label: `Snippet ${targetStage + 1}` };
    }
    if (targetStage === round.stage_index) {
      return { disabled: false, label: `Replay Snippet ${targetStage + 1}` };
    }
    return { disabled: false, label: `Play Snippet ${targetStage + 1}` };
  };

  return (
    <Card title="Round">
      <AnimatePresence mode="wait" initial={false}>
        {!round ? (
          <motion.div
            key="round-empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="host-actions-grid"
          >
            <Button onClick={onStart}>Start Round</Button>
          </motion.div>
        ) : (
          <motion.div
            key={`round-${round.song_number}-${round.status}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24 }}
          >
            <p className="muted-copy">
              Song {round.song_number} • Stage {round.stage_index + 1} • Highest Played {round.max_stage_reached + 1} • Points {round.points_available}
            </p>
            <StatusChip className="mb-3 mt-2 animate-pulseGlow">Status: {round.status}</StatusChip>
            <div className="host-actions-grid">
              {Array.from({ length: stageCount }, (_, stage) => stage).map((stage) => {
                const state = getButtonState(stage);
                return (
                  <Button key={stage} disabled={state.disabled || isFinished} onClick={() => onPlaySnippet(stage)} variant="ghost">
                    {state.label}
                  </Button>
                );
              })}
              <Button onClick={onRevealRound} disabled={isFinished} variant="secondary">
                Reveal
              </Button>
              <Button onClick={onNextRound}>Next Round</Button>
            </div>
            <AnimatePresence>
              {isFinished && (round.reveal_artist || round.reveal_title || round.reveal_source) && (
                <motion.div
                  className="reveal-panel"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <p><strong>Artist:</strong> {round.reveal_artist || 'Unknown'}</p>
                  <p><strong>Title:</strong> {round.reveal_title || 'Unknown'}</p>
                  <p><strong>Source:</strong> {round.reveal_source || round.playback_provider}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
