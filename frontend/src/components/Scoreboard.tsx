import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TeamState } from '../types';
import { Card } from './ui';

type Props = {
  teams: TeamState[];
  maxPoints: number;
};

export function Scoreboard({ teams, maxPoints }: Props) {
  const ordered = [...teams].sort((a, b) => b.score - a.score);
  const safeMaxPoints = Math.max(1, maxPoints);

  return (
    <Card title="Scoreboard">
      <p className="muted-copy mb-3">0 to {safeMaxPoints} points</p>
      <motion.div layout>
        <AnimatePresence initial={false}>
          {ordered.map((team, index) => {
          const clampedScore = Math.max(0, team.score);
          const progressPercent = Math.min(1, clampedScore / safeMaxPoints) * 100;
          return (
            <motion.div
              key={team.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className="team-row"
            >
              <span className="flex items-center gap-2">
                <span className="team-rank">{index + 1}</span>
                <span className="team-label">{team.name}</span>
              </span>
              <div className="team-lane" aria-label={`${team.name} score progress`}>
                <motion.div
                  className="team-box"
                  style={{ '--team-progress': `${progressPercent}%` } as CSSProperties}
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 0.28 }}
                >
                  {team.score}
                </motion.div>
              </div>
              <span className="muted-copy">{Math.min(clampedScore, safeMaxPoints)} / {safeMaxPoints}</span>
            </motion.div>
          );
          })}
        </AnimatePresence>
      </motion.div>
    </Card>
  );
}
