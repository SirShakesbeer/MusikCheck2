import type { CSSProperties } from 'react';
import type { TeamState } from '../types';

type Props = {
  teams: TeamState[];
  maxPoints: number;
};

export function Scoreboard({ teams, maxPoints }: Props) {
  const ordered = [...teams].sort((a, b) => b.score - a.score);
  const safeMaxPoints = Math.max(1, maxPoints);

  return (
    <section>
      <h3>Scoreboard</h3>
      <p>0 to {safeMaxPoints} points</p>
      <div>
        {ordered.map((team) => {
          const clampedScore = Math.max(0, team.score);
          const progressPercent = Math.min(1, clampedScore / safeMaxPoints) * 100;
          return (
            <div key={team.id} className="team-row">
              <span className="team-label">{team.name}</span>
              <div className="team-lane" aria-label={`${team.name} score progress`}>
                <div className="team-box" style={{ '--team-progress': `${progressPercent}%` } as CSSProperties}>
                  {team.score}
                </div>
              </div>
              <span>{Math.min(clampedScore, safeMaxPoints)} / {safeMaxPoints}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
