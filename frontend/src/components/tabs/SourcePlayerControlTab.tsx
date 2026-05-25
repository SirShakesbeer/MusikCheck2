import { ChangeEvent, RefObject } from 'react';

import { useTranslation } from '../../i18n/useTranslation';
import { Button, Field, StatusChip } from '../ui';
import type { LocalSource, SourceType } from '../../services/mediaSourceController';
import type { GameState } from '../../types';

type Props = {
  setupTeamNames: string[];
  setupTeamStopWords: Record<string, string>;
  newTeamName: string;
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
  onNewTeamNameChange: (value: string) => void;
  onTeamStopWordChange: (teamName: string, stopWord: string) => void;
  onAddTeam: () => void;
  onRemoveTeam: (teamName: string) => void;
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

export function SourcePlayerControlTab({
  setupTeamNames,
  setupTeamStopWords,
  newTeamName,
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
  onNewTeamNameChange,
  onTeamStopWordChange,
  onAddTeam,
  onRemoveTeam,
  onSourceTypeChange,
  onSourceValueChange,
  onPickLocalFolder,
  onAddSource,
  onRemoveSource,
  onFolderFilesSelected,
  onStartGame,
  onConnectSpotify,
}: Props) {
  const { t } = useTranslation();
  const teamMembersByTeamId = new Map<string, string[]>();
  for (const player of state?.players ?? []) {
    if (!player.team_id) {
      continue;
    }
    const members = teamMembersByTeamId.get(player.team_id) ?? [];
    members.push(player.name);
    teamMembersByTeamId.set(player.team_id, members);
  }

  return (
    <div>

      <div className="source-row">
        <Field label={t('sourcePlayerControl.teamName')}>
          <input
            value={newTeamName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onNewTeamNameChange(event.target.value)}
            placeholder="Team A"
          />
        </Field>
        <Button onClick={onAddTeam} type="button">
          {t('sourcePlayerControl.addTeam')}
        </Button>
      </div>

      {setupTeamNames.length > 0 && (
        <div className="source-list">
          {setupTeamNames.map((teamName) => {
            const team = state?.teams.find((item) => item.name.toLowerCase() === teamName.toLowerCase());
            const members = team ? teamMembersByTeamId.get(team.id) ?? [] : [];
            const stopWord = setupTeamStopWords[teamName] ?? '';

            return (
              <div className="source-row flex-col items-start gap-1" key={teamName}>
                <div className="source-row w-full">
                  <strong>{t('sourcePlayerControl.team')}</strong>
                  <span>{teamName}</span>
                  <Field label={t('sourcePlayerControl.stopWord')} className="min-w-0 flex-1">
                    <input
                      value={stopWord}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => onTeamStopWordChange(teamName, event.target.value)}
                      placeholder={t('sourcePlayerControl.stopWord')}
                    />
                  </Field>
                  <Button type="button" onClick={() => onRemoveTeam(teamName)} variant="danger" size="sm">
                    {t('sourcePlayerControl.remove')}
                  </Button>
                </div>
                <p className="muted-copy text-left">
                  {t('sourcePlayerControl.stopWordLine', { stopWord: stopWord || t('common.none') })}
                </p>
                <p className="muted-copy text-left">
                  {t('sourcePlayerControl.members')}: {members.length > 0 ? members.join(', ') : t('sourcePlayerControl.noPlayersYet')}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusChip tone={spotifyConnected ? 'ok' : 'warn'}>
          {t('sourcePlayerControl.spotifyLabel')}: {spotifyConnected ? t('sourcePlayerControl.spotifyConnected') : t('sourcePlayerControl.spotifyNotConnected')}
        </StatusChip>
        <Button onClick={onConnectSpotify} disabled={spotifyAuthBusy} variant="ghost" size="sm">
          {spotifyAuthBusy ? t('sourcePlayerControl.connectingSpotify') : t('sourcePlayerControl.connectSpotify')}
        </Button>
      </div>
      {!runtimeTestMode && !youtubeApiConfigured && (
        <p className="danger-text">{t('sourcePlayerControl.youtubeApiNotConfigured')}</p>
      )}

      <div className="source-row">
        <Field label={t('sourcePlayerControl.sourceType')}>
          <select
            value={newSourceType}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onSourceTypeChange(event.target.value as SourceType)}
          >
            {[
              { value: 'youtube-playlist' as SourceType, label: t('mediaSourceTypes.youtubePlaylistLink') },
              { value: 'spotify-playlist' as SourceType, label: t('mediaSourceTypes.spotifyPlaylistLink') },
              { value: 'local-folder' as SourceType, label: t('mediaSourceTypes.localFolder') },
            ].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('sourcePlayerControl.sourceValue')}>
          <input
            value={newSourceValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onSourceValueChange(event.target.value)}
            placeholder={t('sourcePlayerControl.playlistUrlOrFolderName')}
          />
        </Field>

        {newSourceType === 'local-folder' && (
          <Button onClick={onPickLocalFolder} type="button" variant="ghost">
            {t('sourcePlayerControl.pickLocalFolder')}
          </Button>
        )}

        <Button onClick={onAddSource} type="button">
          {t('sourcePlayerControl.addSource')}
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
                {typeof source.importedCount === 'number' && <span>{source.importedCount} {t('common.tracks')}</span>}
              <span>{source.addedByPlayerName ? t('player.addedBy', { name: source.addedByPlayerName }) : t('sourcePlayerControl.addedByHost')}</span>
              <Button type="button" onClick={() => onRemoveSource(source.id)} variant="danger" size="sm">
                {t('sourcePlayerControl.remove')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {state?.lobby_code && (
        <>
          <p>
            {t('sourcePlayerControl.lobbyCode')}: <strong>{state.lobby_code}</strong>
          </p>
          <StatusChip>{t('sourcePlayerControl.shareUrl')}: {`${window.location.origin}/player/${state.lobby_code}`}</StatusChip>

          <h4 className="mt-3 mb-2 text-lg font-display tracking-wide text-mc-cyan">{t('sourcePlayerControl.connectedPlayers')}</h4>
          {state.players.length < 1 ? (
            <p className="muted-copy">{t('sourcePlayerControl.noPlayersConnectedYet')}</p>
          ) : (
            <ul>
              {state.players.map((player) => (
                <li key={player.id}>
                  {player.name} ({player.ready ? t('sourcePlayerControl.ready') : t('sourcePlayerControl.notReady')})
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
          <span>{t('sourcePlayerControl.testModePlaceholderMedia')}</span>
        </label>
      </div>

      <Button onClick={onStartGame} disabled={startGameBusy || startGameDisabled} variant="secondary">
        {startGameBusy ? t('sourcePlayerControl.starting') : t('sourcePlayerControl.startGame')}
      </Button>
      {startGameHint && <p className="danger-text mt-2">{startGameHint}</p>}
    </div>
  );
}
