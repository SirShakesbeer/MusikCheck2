import { ChangeEvent, RefObject } from 'react';

import type { LocalSource, SourceType } from '../../services/mediaSourceController';
import type { GameState } from '../../types';

type Props = {
  hostName: string;
  setupTeams: string;
  newSourceType: SourceType;
  newSourceValue: string;
  localSources: LocalSource[];
  state: GameState | null;
  startGameBusy: boolean;
  startGameDisabled: boolean;
  startGameHint: string | null;
  folderInputRef: RefObject<HTMLInputElement>;
  onHostNameChange: (value: string) => void;
  onSetupTeamsChange: (value: string) => void;
  onSourceTypeChange: (value: SourceType) => void;
  onSourceValueChange: (value: string) => void;
  onPickLocalFolder: () => void;
  onAddSource: () => void;
  onRemoveSource: (sourceId: string) => void;
  onFolderFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onEnsureLobby: () => void;
  onStartGame: () => void;
};

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'youtube-playlist', label: 'YouTube Playlist Link' },
  { value: 'spotify-playlist', label: 'Spotify Playlist Link' },
  { value: 'local-folder', label: 'Local Folder' },
];

export function SourcePlayerControlTab({
  hostName,
  setupTeams,
  newSourceType,
  newSourceValue,
  localSources,
  state,
  startGameBusy,
  startGameDisabled,
  startGameHint,
  folderInputRef,
  onHostNameChange,
  onSetupTeamsChange,
  onSourceTypeChange,
  onSourceValueChange,
  onPickLocalFolder,
  onAddSource,
  onRemoveSource,
  onFolderFilesSelected,
  onEnsureLobby,
  onStartGame,
}: Props) {
  return (
    <section>
      <h3>Source And Player Control</h3>
      <p>Add media sources and monitor connected players before starting the lobby page.</p>

      <label>
        Host name
        <input value={hostName} onChange={(event: ChangeEvent<HTMLInputElement>) => onHostNameChange(event.target.value)} />
      </label>

      <label>
        Team names (comma-separated)
        <input
          value={setupTeams}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onSetupTeamsChange(event.target.value)}
          placeholder="Team A, Team B"
        />
      </label>

      <div className="source-row">
        <label>
          Source type
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
        </label>

        <label>
          Source value
          <input
            value={newSourceValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onSourceValueChange(event.target.value)}
            placeholder="Playlist URL or folder name"
          />
        </label>

        {newSourceType === 'local-folder' && (
          <button onClick={onPickLocalFolder} type="button">
            Pick Local Folder
          </button>
        )}

        <button onClick={onAddSource} type="button">
          Add Source
        </button>
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
              <button type="button" onClick={() => onRemoveSource(source.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="source-row">
        <button onClick={onEnsureLobby} type="button">
          {state?.lobby_code ? 'Refresh Lobby State' : 'Create Lobby'}
        </button>
      </div>

      {state?.lobby_code && (
        <>
          <p>
            Lobby code: <strong>{state.lobby_code}</strong>
          </p>
          <p>Share URL: {`${window.location.origin}/player/${state.lobby_code}`}</p>

          <h4>Connected Players</h4>
          {state.players.length < 1 ? (
            <p>No players connected yet.</p>
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

      <button onClick={onStartGame} disabled={startGameBusy || startGameDisabled}>
        {startGameBusy ? 'Starting...' : 'Start Game'}
      </button>
      {startGameHint && <p>{startGameHint}</p>}
    </section>
  );
}
