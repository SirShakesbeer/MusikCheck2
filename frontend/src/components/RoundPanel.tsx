import type { RoundState } from '../types';

type Props = {
  round: RoundState | null;
  onStart: () => void;
  onNextStage: () => void;
};

export function RoundPanel({ round, onStart, onNextStage }: Props) {
  return (
    <section>
      <h3>Round</h3>
      {!round && <button onClick={onStart}>Start Round</button>}
      {round && (
        <>
          <p>
            Stage {round.stage_index + 1} • Duration {round.stage_duration_seconds}s • Points {round.points_available}
          </p>
          <p>Status: {round.status}</p>
          <audio controls src={round.snippet_url} />
          <div>
            <button onClick={onNextStage} disabled={round.status === 'finished'}>
              Next Stage
            </button>
          </div>
        </>
      )}
    </section>
  );
}
