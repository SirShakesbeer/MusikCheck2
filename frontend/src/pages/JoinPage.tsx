import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Field, StatusChip } from '../components/ui';
import { DEFAULT_PLAYER_NAME } from '../config/defaults';
import { useTranslation } from '../i18n/useTranslation';

const PLAYER_NAME_STORAGE_KEY = 'musikcheck2.playerName';

export function JoinPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [code, setCode] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>(DEFAULT_PLAYER_NAME);

  const onJoin = (event: FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    const trimmedPlayerName = playerName.trim();
    if (!normalized || !trimmedPlayerName) {
      return;
    }
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, trimmedPlayerName);
    navigate(`/player/${normalized}`);
  };

  return (
    <main>
      <Card>
        <StatusChip>{t('join.status')}</StatusChip>
        <h1 className="page-heading mt-2">{t('join.title')}</h1>
        <p className="page-subheading">{t('join.subtitle')}</p>

        <form onSubmit={onJoin} className="source-row">
          <Field label={t('join.yourName')} className="min-w-0">
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder={t('join.playerNamePlaceholder')} />
          </Field>
          <Field label={t('join.lobbyCode')} className="min-w-0">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t('join.lobbyCodePlaceholder')}
              maxLength={8}
              className="max-w-[240px]"
            />
          </Field>
          <Button type="submit" disabled={!code.trim() || !playerName.trim()}>
            {t('join.continue')}
          </Button>
        </form>
      </Card>

      <Card title={t('join.quickTipTitle')}>
        <p className="muted-copy">{t('join.quickTip')}</p>
        <div className="source-row mt-3">
          <Button onClick={() => navigate('/')} variant="ghost">{t('join.backToHome')}</Button>
        </div>
      </Card>
    </main>
  );
}
