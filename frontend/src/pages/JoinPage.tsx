import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
      <h1>Join Game</h1>
      <form onSubmit={onJoin}>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Enter lobby code"
          maxLength={8}
        />
        <button type="submit" disabled={!code.trim()}>
          Continue
        </button>
      </form>
      <button onClick={() => navigate('/')}>Back</button>
    </main>
  );
}
