import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { LANGUAGE_LABELS, type Language } from '../i18n/translations';
import { useTranslation } from '../i18n/useTranslation';
import { api } from '../services/api';
import { useUiPreferencesStore, type BackgroundMode } from '../stores/uiPreferencesStore';
import { ThemeSelector } from './ThemeSwitcher';
import { Button, Card, StatusChip } from './ui';

function parseLobbyCode(pathname: string): string | null {
  const lobbyMatch = pathname.match(/^\/host\/(?:setup|lobby)\/([^/]+)$/i);
  return lobbyMatch?.[1] ?? null;
}

export function GlobalOptionsMenu() {
  const [open, setOpen] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyAuthBusy, setSpotifyAuthBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const location = useLocation();
  const { language, setLanguage, t } = useTranslation();
  const backgroundMode = useUiPreferencesStore((store) => store.backgroundMode);
  const setBackgroundMode = useUiPreferencesStore((store) => store.setBackgroundMode);

  const lobbyCode = useMemo(() => parseLobbyCode(location.pathname), [location.pathname]);

  useEffect(() => {
    const loadSpotifyStatus = async () => {
      try {
        const status = await api.getSpotifyStatus();
        setSpotifyConnected(Boolean(status.data.connected));
      } catch (err) {
        console.warn('Failed to load Spotify status', err);
      }
    };

    void loadSpotifyStatus();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
    }
  }, [open]);

  const connectSpotify = async () => {
    setSpotifyAuthBusy(true);
    setError(null);

    try {
      const auth = await api.getSpotifyAuthUrl();
      const popup = window.open(auth.data.auth_url, 'spotify-oauth', 'width=520,height=720,resizable=yes');
      if (!popup) {
        throw new Error('Popup was blocked. Please allow popups for Spotify login.');
      }

      const startedAt = Date.now();
      const intervalId = window.setInterval(async () => {
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs > 120000) {
          window.clearInterval(intervalId);
          setSpotifyAuthBusy(false);
          return;
        }

        try {
          const status = await api.getSpotifyStatus();
          if (!status.data.connected) {
            return;
          }

          setSpotifyConnected(true);
          if (lobbyCode) {
            await api.setLobbySpotifyConnection(lobbyCode, true);
          }
          setSpotifyAuthBusy(false);
          window.clearInterval(intervalId);
          if (!popup.closed) {
            popup.close();
          }
        } catch (err) {
          console.warn('Spotify connection polling failed', err);
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSpotifyAuthBusy(false);
    }
  };

  return (
    <>
      <Button
        ref={triggerRef}
        className="global-options-trigger paper-button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {t('options.button')}
      </Button>

      {open && (
        <div
          className="options-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('options.title')}
          onClick={() => setOpen(false)}
        >
          <Card title={t('options.title')} tone="panel" className="options-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="options-section mb-3">
              <p className="options-section-title">{t('options.style')}</p>
              <ThemeSelector className="options-theme-selector" label={t('theme.label')} selectClassName="options-theme-select" />
            </div>

            <div className="options-section mb-3">
              <p className="options-section-title">{t('options.background')}</p>
              <div className="theme-selector-group options-theme-selector">
                <span className="text-xs font-semibold uppercase tracking-wide text-cyan-50">{t('options.mode')}</span>
                <select
                  className="options-theme-select"
                  value={backgroundMode}
                  onChange={(event) => setBackgroundMode(event.target.value as BackgroundMode)}
                >
                  <option value="flat">{t('options.flatGradient')}</option>
                  <option value="room-3d">{t('options.room3D')}</option>
                </select>
              </div>
            </div>

            <div className="options-section mb-3">
              <p className="options-section-title">{t('options.language')}</p>
              <div className="theme-selector-group options-theme-selector">
                <span className="text-xs font-semibold uppercase tracking-wide text-cyan-50">{t('options.language')}</span>
                <select
                  className="options-theme-select"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as Language)}
                >
                  <option value="en">{LANGUAGE_LABELS.en}</option>
                  <option value="de">{LANGUAGE_LABELS.de}</option>
                </select>
              </div>
            </div>

            <div className="options-section mb-3">
              <p className="options-section-title">{t('options.integrations')}</p>
              <div className="source-row-mobile mb-2">
                <StatusChip tone={spotifyConnected ? 'ok' : 'warn'}>
                  Spotify {spotifyConnected ? t('options.spotifyConnected') : t('options.spotifyNotConnected')}
                </StatusChip>
              </div>
              <div className="host-actions-grid">
                <Button onClick={connectSpotify} disabled={spotifyAuthBusy}>
                  {spotifyAuthBusy ? t('options.connectingSpotify') : (spotifyConnected ? t('options.reconnectSpotify') : t('options.connectSpotify'))}
                </Button>
              </div>
            </div>

            {error && <p className="danger-text mb-3">{error}</p>}

            <div className="host-actions-grid">
              <Button variant="ghost" onClick={() => setOpen(false)}>{t('options.close')}</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
