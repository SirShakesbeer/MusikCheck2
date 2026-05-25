import type { CSSProperties } from 'react';

import type { RoundTeamState, TeamState } from '../types';
import { Button, StatusChip } from './ui';

type Props = {
  teams: TeamState[];
  roundStates: Record<string, RoundTeamState>;
  roundFinished: boolean;
  maxPoints: number;
  winnerTeamIds: Set<string>;
  hasWinnerLock: boolean;
  onToggleFact: (teamId: string, fact: 'artist' | 'title') => void;
  onPenalty: (teamId: string) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function TeamProgressBoard({
  teams,
  roundStates,
  roundFinished,
  maxPoints,
  winnerTeamIds,
  hasWinnerLock,
  onToggleFact,
  onPenalty,
}: Props) {
  if (teams.length < 1) {
    return <p className="muted-copy">No teams available yet.</p>;
  }

  const safeMaxPoints = Math.max(1, maxPoints);
  const teamCount = teams.length;
  const teamCardScale =
    teamCount <= 3
      ? 1
      : teamCount === 4
        ? 0.92
        : teamCount === 5
          ? 0.84
          : Math.max(0.72, 0.84 - (teamCount - 5) * 0.05);

  return (
    <div
      className="team-progress-board"
      style={{
        '--team-count': String(teamCount),
      } as CSSProperties}
    >
      {teams.map((team, index) => {
        const teamState = roundStates[team.id];
        const artistSelected = (teamState?.artist_points ?? 0) > 0;
        const titleSelected = (teamState?.title_points ?? 0) > 0;
        const penaltyApplied = Boolean(teamState?.wrong_guess_penalty_applied);
        const disablePenalty = !roundFinished || penaltyApplied;
        const disableArtistToggle = roundFinished ? !artistSelected || !penaltyApplied : hasWinnerLock && !artistSelected;
        const disableTitleToggle = roundFinished ? !titleSelected || !penaltyApplied : hasWinnerLock && !titleSelected;

        const progress = clamp(team.score / safeMaxPoints, 0, 1);
        const leftPercent = 12 + progress * 76;

        const style = {
          left: `${leftPercent}%`,
          transform: 'translate(-50%, -50%)',
          animationDelay: `${index * 120}ms`,
          '--team-card-scale': String(teamCardScale),
        } as CSSProperties & { '--team-card-scale': string };

        return (
          <div key={team.id} className="team-progress-lane">
            <article className="team-paper-card" style={style}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-lg">{team.name}</strong>
                <div className="flex items-center gap-2">
                  <StatusChip>Score: {team.score}</StatusChip>
                  {winnerTeamIds.has(team.id) && <StatusChip tone="ok">Finish</StatusChip>}
                </div>
              </div>

              {teamState && (
                <p className="muted-copy mb-2">
                  Artist {teamState.artist_points} / Title {teamState.title_points} / Bonus {teamState.bonus_points}
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
                <Button onClick={() => onPenalty(team.id)} disabled={disablePenalty} variant="danger" size="sm">
                  {penaltyApplied ? 'Penalty Applied' : 'Wrong Guess Penalty'}
                </Button>
              </div>

              {roundFinished && !penaltyApplied && (
                <p className="muted-copy mt-2">Reveal first, then apply penalty before removing points.</p>
              )}
            </article>
          </div>
        );
      })}
    </div>
  );
}
