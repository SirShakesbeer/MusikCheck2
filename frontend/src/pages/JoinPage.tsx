import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, StatusChip } from '../components/ui';

export function JoinPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState<string>('');

  const onJoin = (event: FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    navigate(`/player/${normalized}`);
  };

  return (
    <main>
      <Card>
        <StatusChip>Player Entry</StatusChip>
        <h1 className="page-heading mt-2">Join A Lobby</h1>
        <p className="page-subheading">Enter the host code and jump straight into the round.</p>

        <form onSubmit={onJoin} className="source-row">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Enter lobby code"
            maxLength={8}
            className="max-w-[240px]"
          />
          <Button type="submit" disabled={!code.trim()}>
            Continue
          </Button>
        </form>
      </Card>

      <Card title="Quick Tip">
        <p className="muted-copy">Use the exact code shown on the host screen. Codes are case-insensitive.</p>
        <div className="source-row mt-3">
          <Button onClick={() => navigate('/')} variant="ghost">Back To Home</Button>
        </div>
      </Card>
    </main>
  );
}
