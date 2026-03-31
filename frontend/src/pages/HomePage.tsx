import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, StatusChip } from '../components/ui';
import { DEFAULT_HOST_NAME, DEFAULT_PRESET_KEY, DEFAULT_TEAM_NAMES } from '../config/defaults';
import { api } from '../services/api';

export function HomePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const onHost = async () => {
    setBusy(true);
    try {
      const result = await api.createLobby({
        host_name: DEFAULT_HOST_NAME,
        preset_key: DEFAULT_PRESET_KEY,
        teams: [...DEFAULT_TEAM_NAMES],
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
        <h1 className="page-heading mt-2">MusikCheck 2</h1>
        <p className="page-subheading">The classic Thomasius music quiz with a modern twist.</p>
      </Card>

      <Card title="Choose Your Role" subtitle="Hosts configure rounds and scoring. Players join with a lobby code and can interact with their phone.">
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
          <p className="muted-copy">2. (OPTIONAL) Players join from phones and set ready.</p>
          <p className="muted-copy">3. Round snippets play, teams race to guess title and artist.</p>
        </div>
      </Card>

      {error && <p className="danger-text">{error}</p>}
    </main>
  );
}
