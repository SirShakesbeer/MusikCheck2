import type { TeamState } from '../types';

type Props = {
  teams: TeamState[];
};

export function Scoreboard({ teams }: Props) {
  const ordered = [...teams].sort((a, b) => b.score - a.score);

  return (
    <section style={{ marginTop: '24px' }}>
      <h3 style={{ marginBottom: '16px' }}>Scoreboard</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        {ordered.length === 0 ? (
          <p>No teams yet</p>
        ) : (
          ordered.map((team, index) => (
            <div
              key={team.id}
              style={{
                padding: '16px',
                backgroundColor: index === 0 ? '#fff9e6' : '#f9f9f9',
                border: index === 0 ? '3px solid #FFC107' : '2px solid #ddd',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <p style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }}>
                {team.name}
              </p>
              <p
                style={{
                  margin: '0',
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: index === 0 ? '#FFC107' : '#333',
                }}
              >
                {team.score}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
