import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, StatusChip } from '../components/ui';
import { DEFAULT_PRESET_KEY, DEFAULT_TEAM_NAMES } from '../config/defaults';
import { useTranslation } from '../i18n/useTranslation';
import { api } from '../services/api';

export function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const onHost = async () => {
    setBusy(true);
    try {
      const result = await api.createLobby({
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
    <main className='home-page'>
      <Card>
        <h1 className="page-heading mt-2">{t('home.title')}</h1>
        <p className="page-subheading">{t('home.subtitle')}</p>
      </Card>

      <Card title={t('home.chooseRoleTitle')} subtitle={t('home.chooseRoleSubtitle')}>
        <div className="source-row">
          <Button onClick={onHost} disabled={busy}>
            {busy ? t('home.creatingLobby') : t('home.hostGame')}
          </Button>
          <Button onClick={() => navigate('/join')} disabled={busy} variant="ghost">
            {t('home.joinWithCode')}
          </Button>
        </div>
      </Card>

      <Card title={t('home.flowTitle')}>
        <div className="source-list">
          <p className="muted-copy">{t('home.flowStep1')}</p>
          <p className="muted-copy">{t('home.flowStep2')}</p>
          <p className="muted-copy">{t('home.flowStep3')}</p>
        </div>
      </Card>

      {error && <p className="danger-text">{error}</p>}
    </main>
  );
}
