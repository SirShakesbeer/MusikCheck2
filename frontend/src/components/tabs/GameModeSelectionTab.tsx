import { ChangeEvent } from 'react';

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
    <section>
      <h3>Select Game Mode</h3>
      <p>Choose a preset card or create a custom game mode.</p>

      <label>
        <input
          type="checkbox"
          checked={runtimeTestMode}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onToggleRuntimeTestMode(event.target.checked)}
          disabled={runtimeConfigBusy}
        />
        Test mode (placeholder snippets)
      </label>

      {!runtimeTestMode && !youtubeApiConfigured && (
        <p>YouTube API key is not configured; real YouTube ingestion will fail.</p>
      )}

      <p>
        Spotify: {spotifyConnected ? 'Connected' : 'Not connected'}
        <button onClick={onConnectSpotify} disabled={spotifyAuthBusy} style={{ marginLeft: 8 }}>
          {spotifyAuthBusy ? 'Connecting...' : 'Connect Spotify'}
        </button>
      </p>

      <div className="source-list">
        {gameModes.map((preset) => (
          <button key={preset.key} className="source-row" onClick={() => onSelectPreset(preset)}>
            <strong>{preset.name}</strong>
            <span>{preset.requires_phone_connections ? 'Contains phone-required rounds' : 'No phone-required rounds'}</span>
          </button>
        ))}

        <button className="source-row" onClick={onSelectCustom}>
          <strong>Custom Game</strong>
          <span>Create your own round mix and frequencies</span>
        </button>
      </div>
    </section>
  );
}
