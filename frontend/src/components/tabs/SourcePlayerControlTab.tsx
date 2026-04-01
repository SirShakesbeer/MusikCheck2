import { ChangeEvent, RefObject } from 'react';

import { Button, Field, StatusChip } from '../ui';
import type { LocalSource, SourceType } from '../../services/mediaSourceController';
import type { GameState } from '../../types';

type Props = {
  setupTeams: string;
  spotifyConnected: boolean;
  spotifyAuthBusy: boolean;
  newSourceType: SourceType;
  newSourceValue: string;
  localSources: LocalSource[];
  state: GameState | null;
  startGameBusy: boolean;
  startGameDisabled: boolean;
  startGameHint: string | null;
  folderInputRef: RefObject<HTMLInputElement>;
  youtubeApiConfigured: boolean;
  runtimeTestMode: boolean;
  runtimeConfigBusy: boolean;
  onSetupTeamsChange: (value: string) => void;
  onSourceTypeChange: (value: SourceType) => void;
  onSourceValueChange: (value: string) => void;
  onPickLocalFolder: () => void;
  onAddSource: () => void;
  onRemoveSource: (sourceId: string) => void;
  onFolderFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartGame: () => void;
  onConnectSpotify: () => void;
  onToggleRuntimeTestMode: (enabled: boolean) => void;
};

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'youtube-playlist', label: 'YouTube Playlist Link' },
  { value: 'spotify-playlist', label: 'Spotify Playlist Link' },
  { value: 'local-folder', label: 'Local Folder' },
];

export function SourcePlayerControlTab({
  setupTeams,
  newSourceType,
  newSourceValue,
  localSources,
  state,
  startGameBusy,
  startGameDisabled,
  startGameHint,
  folderInputRef,
  spotifyConnected,
  spotifyAuthBusy,
  runtimeTestMode,
  youtubeApiConfigured,
  runtimeConfigBusy,
  onToggleRuntimeTestMode,
  onSetupTeamsChange,
  onSourceTypeChange,
  onSourceValueChange,
  onPickLocalFolder,
  onAddSource,
  onRemoveSource,
  onFolderFilesSelected,
  onStartGame,
  onConnectSpotify,
}: Props) {
  return (
    <div>

      <Field label="Team names (comma-separated)">
        <input
          value={setupTeams}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onSetupTeamsChange(event.target.value)}
          placeholder="Team A, Team B"
        />
      </Field>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusChip tone={spotifyConnected ? 'ok' : 'warn'}>
          Spotify: {spotifyConnected ? 'Connected' : 'Not connected'}
        </StatusChip>
        <Button onClick={onConnectSpotify} disabled={spotifyAuthBusy} variant="ghost" size="sm">
          {spotifyAuthBusy ? 'Connecting...' : 'Connect Spotify'}
        </Button>
      </div>
      {!runtimeTestMode && !youtubeApiConfigured && (
        <p className="danger-text">YouTube API key is not configured; real YouTube ingestion will fail.</p>
      )}

      <div className="source-row">
        <Field label="Source type">
          <select
            value={newSourceType}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onSourceTypeChange(event.target.value as SourceType)}
          >
            {SOURCE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Source value">
          <input
            value={newSourceValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onSourceValueChange(event.target.value)}
            placeholder="Playlist URL or folder name"
          />
        </Field>

        {newSourceType === 'local-folder' && (
          <Button onClick={onPickLocalFolder} type="button" variant="ghost">
            Pick Local Folder
          </Button>
        )}

        <Button onClick={onAddSource} type="button">
          Add Source
        </Button>
      </div>

      <input
        ref={folderInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={onFolderFilesSelected}
      />

      {localSources.length > 0 && (
        <div className="source-list">
          {localSources.map((source) => (
            <div className="source-row" key={source.id}>
              <strong>{source.type}</strong>
              <span>{source.value}</span>
              {typeof source.importedCount === 'number' && <span>{source.importedCount} tracks</span>}
              <Button type="button" onClick={() => onRemoveSource(source.id)} variant="danger" size="sm">
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {state?.lobby_code && (
        <>
          <p>
            Lobby code: <strong>{state.lobby_code}</strong>
          </p>
          <StatusChip>Share URL: {`${window.location.origin}/player/${state.lobby_code}`}</StatusChip>

          <h4 className="mt-3 mb-2 text-lg font-display tracking-wide text-mc-cyan">Connected Players</h4>
          {state.players.length < 1 ? (
            <p className="muted-copy">No players connected yet.</p>
          ) : (
            <ul>
              {state.players.map((player) => (
                <li key={player.id}>
                  {player.name} ({player.ready ? 'ready' : 'not ready'})
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      
      <div className='flex items-center justify-content mt-6 ml-6'>
        <label className="mb-3 flex flex-row items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-50">
          <input
            type="checkbox"
            checked={runtimeTestMode}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onToggleRuntimeTestMode(event.target.checked)}
            disabled={runtimeConfigBusy}
            className="min-h-0 h-4 w-4"
          />
          <span>Test mode (placeholder media)</span>
        </label>
      </div>

      <Button onClick={onStartGame} disabled={startGameBusy || startGameDisabled} variant="secondary">
        {startGameBusy ? 'Starting...' : 'Start Game'}
      </Button>
      {startGameHint && <p className="danger-text mt-2">{startGameHint}</p>}
    </div>
  );
}
