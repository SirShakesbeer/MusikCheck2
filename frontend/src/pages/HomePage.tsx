import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, StatusChip } from '../components/ui';
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
      <Card>
        <StatusChip>Party Quiz Prototype</StatusChip>
        <h1 className="page-heading mt-2">MusikCheck2</h1>
        <p className="page-subheading">Create a lobby in seconds and run a loud, colorful music battle like a game show.</p>
      </Card>

      <Card title="Choose Your Role" subtitle="Hosts configure rounds and scoring. Players join with a lobby code and compete live.">
        <div className="source-row">
          <Button onClick={onHost} disabled={busy}>
            {busy ? 'Creating Lobby...' : 'Host Game'}
          </Button>
          <Button onClick={() => navigate('/join')} disabled={busy} variant="ghost">
            Join With Code
          </Button>
        </div>
      </Card>

      <Card title="How It Flows">
        <div className="source-list">
          <p className="muted-copy">1. Host sets teams, game mode, and music sources.</p>
          <p className="muted-copy">2. Players join from phones and set ready.</p>
          <p className="muted-copy">3. Round snippets play, teams race to guess title and artist.</p>
        </div>
      </Card>

      {error && <p className="danger-text">{error}</p>}

      <div className="source-row mt-2">
        <Button onClick={onHost} disabled={busy} variant="secondary">
          {busy ? 'Creating Lobby...' : 'Quick Start'}
        </Button>
      </div>
    </main>
  );
}
