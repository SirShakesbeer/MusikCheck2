import type { TeamState } from '../types';

type Props = {
  teams: TeamState[];
};

export function Scoreboard({ teams }: Props) {
  const ordered = [...teams].sort((a, b) => b.score - a.score);
  return (
    <section>
      <h3>Scoreboard</h3>
      <ul>
        {ordered.map((team) => (
          <li key={team.id}>
            {team.name}: {team.score}
          </li>
        ))}
      </ul>
    </section>
  );
}
