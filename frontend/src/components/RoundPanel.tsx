import type { RoundState } from '../types';

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
    <section>
      <h3>Round</h3>
      {!round && <button onClick={onStart}>Start Round</button>}
      {round && (
        <>
          <p>
            Song {round.song_number} • Stage {round.stage_index + 1} • Highest Played {round.max_stage_reached + 1} • Points {round.points_available}
          </p>
          <p>Status: {round.status}</p>
          <div className="source-row">
            {Array.from({ length: stageCount }, (_, stage) => stage).map((stage) => {
              const state = getButtonState(stage);
              return (
                <button key={stage} disabled={state.disabled || isFinished} onClick={() => onPlaySnippet(stage)}>
                  {state.label}
                </button>
              );
            })}
            <button onClick={onRevealRound} disabled={isFinished}>
              Reveal
            </button>
            <button onClick={onNextRound}>Next Round</button>
          </div>
          {isFinished && (round.reveal_artist || round.reveal_title || round.reveal_source) && (
            <div className="reveal-panel">
              <p><strong>Artist:</strong> {round.reveal_artist || 'Unknown'}</p>
              <p><strong>Title:</strong> {round.reveal_title || 'Unknown'}</p>
              <p><strong>Source:</strong> {round.reveal_source || round.playback_provider}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
