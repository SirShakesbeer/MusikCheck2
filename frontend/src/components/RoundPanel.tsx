import type { RoundState } from '../types';

type Props = {
  round: RoundState | null;
  onStart: () => void;
  onPlaySnippet: (stageIndex: number) => void;
  onNextRound: () => void;
  onFinishRound: () => void;
};

export function RoundPanel({ round, onStart, onPlaySnippet, onNextRound, onFinishRound }: Props) {
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
            <button onClick={onFinishRound} disabled={isFinished}>
              Finish Round
            </button>
            <button onClick={onNextRound}>Next Round</button>
          </div>
        </>
      )}
    </section>
  );
}
