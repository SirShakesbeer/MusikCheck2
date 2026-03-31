import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../services/api';

export function HomePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const onHost = async () => {
    setBusy(true);
    try {
      const result = await api.createLobby({
        host_name: 'Host',
        preset_key: 'classic_audio',
        teams: ['Team A', 'Team B'],
      });
      setError(null);
      navigate(`/host/setup/${result.data.lobby_code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>MusikCheck2</h1>
      <p>Choose how you want to enter the game.</p>
      <div className="source-row">
        <button onClick={onHost} disabled={busy}>
          {busy ? 'Creating Lobby...' : 'Host'}
        </button>
        <button onClick={() => navigate('/join')} disabled={busy}>
          Join Game
        </button>
      </div>
      {error && <p>{error}</p>}
    </main>
  );
}
