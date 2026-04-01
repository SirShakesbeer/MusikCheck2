import { ChangeEvent } from 'react';

import { Button, Card, StatusChip } from '../ui';
import type { GameModePresetState } from '../../types';

type Props = {
  gameModes: GameModePresetState[];
  runtimeTestMode: boolean;
  runtimeConfigBusy: boolean;
  youtubeApiConfigured: boolean;
  spotifyConnected: boolean;
  spotifyAuthBusy: boolean;
  onToggleRuntimeTestMode: (enabled: boolean) => void;
  onConnectSpotify: () => void;
  onSelectPreset: (preset: GameModePresetState) => void;
  onSelectCustom: () => void;
};

export function GameModeSelectionTab({
  gameModes,
  runtimeTestMode,
  runtimeConfigBusy,
  youtubeApiConfigured,
  spotifyConnected,
  spotifyAuthBusy,
  onToggleRuntimeTestMode,
  onConnectSpotify,
  onSelectPreset,
  onSelectCustom,
}: Props) {
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-50">
        <input
          type="checkbox"
          checked={runtimeTestMode}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onToggleRuntimeTestMode(event.target.checked)}
          disabled={runtimeConfigBusy}
          className="min-h-0 h-4 w-4"
        />
        <span>Test mode (placeholder snippets)</span>
      </label>

      {!runtimeTestMode && !youtubeApiConfigured && (
        <p className="danger-text">YouTube API key is not configured; real YouTube ingestion will fail.</p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusChip tone={spotifyConnected ? 'ok' : 'warn'}>
          Spotify: {spotifyConnected ? 'Connected' : 'Not connected'}
        </StatusChip>
        <Button onClick={onConnectSpotify} disabled={spotifyAuthBusy} variant="ghost" size="sm">
          {spotifyAuthBusy ? 'Connecting...' : 'Connect Spotify'}
        </Button>
      </div>

      <div className="source-list">
        {gameModes.map((preset) => (
          <Button
            key={preset.key}
            className="source-row w-full justify-between text-left"
            onClick={() => onSelectPreset(preset)}
            variant="ghost"
          >
            <strong>{preset.name}</strong>
            <span>{preset.requires_phone_connections ? 'Contains phone-required rounds' : 'No phone-required rounds'}</span>
          </Button>
        ))}

        <Button className="source-row w-full justify-between text-left" onClick={onSelectCustom} variant="ghost">
          <strong>Custom Game</strong>
          <span>Create your own round mix and frequencies</span>
        </Button>
      </div>
    </div>
  );
}
