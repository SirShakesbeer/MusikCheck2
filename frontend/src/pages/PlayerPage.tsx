import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useParams } from 'react-router-dom';

import { Button, Card, Field, StatusChip } from '../components/ui';
import { DEFAULT_PLAYER_NAME, DEFAULT_PLAYER_TEAM_NAME } from '../config/defaults';
import { useTranslation } from '../i18n/useTranslation';
import { api } from '../services/api';
import { addSource, extractFolderSelection, pickLocalFolderName, type LocalSource, type SourceType } from '../services/mediaSourceController';
import { connectLobbySocket } from '../services/ws';
import type { GameState } from '../types';

const PLAYER_NAME_STORAGE_KEY = 'musikcheck2.playerName';

export function PlayerPage() {
  const { code = '' } = useParams();
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const { t } = useTranslation();
  const [playerName, setPlayerName] = useState<string>(() => window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || DEFAULT_PLAYER_NAME);
  const [teamName, setTeamName] = useState(DEFAULT_PLAYER_TEAM_NAME);
  const [guessTitle, setGuessTitle] = useState('');
  const [guessArtist, setGuessArtist] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('youtube-playlist');
  const [sourceValue, setSourceValue] = useState('');
  const [pendingLocalFileCount, setPendingLocalFileCount] = useState<number>(0);
  const [localSources, setLocalSources] = useState<LocalSource[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [joinedTeamId, setJoinedTeamId] = useState<string | null>(null);
  const [joinedPlayerId, setJoinedPlayerId] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    return connectLobbySocket(code, setState);
  }, [code]);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
  }, [playerName]);

  useEffect(() => {
    const availableTeamName = state?.teams.find((team) => team.name.toLowerCase() === teamName.toLowerCase())?.name;
    if (availableTeamName) {
      if (availableTeamName !== teamName) {
        setTeamName(availableTeamName);
      }
      return;
    }

    if (state?.teams.length) {
      setTeamName(state.teams[0].name);
    }
  }, [state?.teams, teamName]);

  const teamId = useMemo(() => {
    if (joinedTeamId && state?.teams.some((team) => team.id === joinedTeamId)) return joinedTeamId;
    if (!state) return null;
    const team = state.teams.find((t) => t.name.toLowerCase() === teamName.toLowerCase());
    return team?.id ?? null;
  }, [joinedTeamId, state, teamName]);

  const activeTeam = useMemo(() => {
    if (!state) return null;
    if (joinedTeamId) {
      return state.teams.find((team) => team.id === joinedTeamId) ?? null;
    }
    return state.teams.find((team) => team.name.toLowerCase() === teamName.toLowerCase()) ?? null;
  }, [joinedTeamId, state, teamName]);

  const activeStopWord = (activeTeam?.stop_word || '').trim();

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (!state?.teams.some((team) => team.name.toLowerCase() === teamName.toLowerCase())) {
        throw new Error(t('player.chooseTeamFirst'));
      }
      const result = await api.joinLobby(code, playerName, teamName);
      setState(result.data);
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName.trim());
      const joinedTeam = result.data.teams.find((team) => team.name.toLowerCase() === teamName.toLowerCase());
      setJoinedTeamId(joinedTeam?.id ?? null);
      const joinedPlayer = result.data.players.find(
        (player) => player.name.toLowerCase() === playerName.toLowerCase() && player.team_id === (joinedTeam?.id ?? null),
      );
      setJoinedPlayerId(joinedPlayer?.id ?? null);
      setPlayerReady(Boolean(joinedPlayer?.ready));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onAddSource = async () => {
    try {
      const lobbyCode = code.trim();
      const source = await addSource({
        sourceType,
        sourceValue,
        pendingLocalFileCount,
        lobbyCode,
        addedByPlayerName: playerName.trim(),
      });
      setLocalSources((previous) => [...previous, source]);
      setSourceValue('');
      setPendingLocalFileCount(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onFolderFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const selection = extractFolderSelection(event.target.files);
    if (!selection) {
      return;
    }

    setSourceValue(selection.folderName);
    setPendingLocalFileCount(selection.fileCount);
    setError(null);
  };

  const pickLocalFolder = async () => {
    const folderName = await pickLocalFolderName(window);
    if (folderName) {
      setSourceValue(folderName);
      setPendingLocalFileCount(1);
      setError(null);
      return;
    }

    folderInputRef.current?.click();
  };

  const onToggleReady = async () => {
    if (!joinedPlayerId) return;
    const nextReady = !playerReady;
    const result = await api.setPlayerReady(code, joinedPlayerId, nextReady);
    setState(result.data);
    setPlayerReady(nextReady);
  };

  const onStop = async () => {
    if (!teamId) return;
    const result = await api.stopRound(code, teamId, playerName);
    setState(result.data);
  };

  const onGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!teamId) return;
    const result = await api.submitGuess(code, teamId, guessTitle, guessArtist);
    setState(result.data);
  };

  const onBuzz = async () => {
    if (!joinedPlayerId) return;
    const result = await api.buzzRound(code, joinedPlayerId);
    setState(result.data);
  };

  const buzzerOwnerId = state?.current_round?.buzzer_player_id ?? null;
  const buzzerOwnedByMe = Boolean(joinedPlayerId && buzzerOwnerId && joinedPlayerId === buzzerOwnerId);
  const buzzerTaken = Boolean(buzzerOwnerId);
  const teamOptions = state?.teams ?? [];
  const buzzButtonLabel = activeStopWord ? t('player.buzzWithStopWord', { stopWord: activeStopWord }) : t('player.buzzIn');

  const teamAccent = useMemo(() => {
    const seed = activeTeam?.id || activeTeam?.name || teamName;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) % 360;
    }
    return `hsl(${hash} 85% 62%)`;
  }, [activeTeam?.id, activeTeam?.name, teamName]);

  return (
    <main>
      <Card>
        <StatusChip>{t('player.panelStatus')}</StatusChip>
        <h1 className="page-heading mt-2">{t('player.title')}</h1>
        <p className="page-subheading">{t('player.lobby', { code })}</p>

        <form onSubmit={onJoin} className="player-form-grid">
          <Field label={t('player.playerName')} className="min-w-0">
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder={t('player.playerNamePlaceholder')} />
          </Field>
          <Field label={t('player.teamName')} className="min-w-0">
            <select value={teamName} onChange={(e) => setTeamName(e.target.value)}>
              {teamOptions.length < 1 ? <option value="">{t('player.noTeamsAvailable')}</option> : null}
              {teamOptions.map((team) => (
                <option key={team.id} value={team.name}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="full">
            <Button type="submit" className="w-full sm:w-auto" disabled={teamOptions.length < 1}>
              {joinedPlayerId ? t('player.switchTeam') : t('player.joinTeam')}
            </Button>
          </div>
        </form>
      </Card>

      <AnimatePresence>
        {state?.current_round?.status === 'playing' && activeStopWord && (
          <motion.div
            key={`${activeTeam?.id || teamName}-${activeStopWord}`}
            className="fixed inset-x-0 top-[18vh] z-40 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="mx-auto w-max rounded-full border px-5 py-3 text-2xl font-display tracking-[0.28em] uppercase"
              style={{
                borderColor: teamAccent,
                color: teamAccent,
                background: 'rgba(2, 6, 23, 0.7)',
                textShadow: '0 0 18px rgba(255,255,255,0.18)',
              }}
              initial={{ x: '110vw', rotate: -2, scale: 0.96 }}
              animate={{ x: '-110vw', rotate: 2, scale: [0.96, 1.04, 0.96] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
            >
              {activeTeam?.name ? `${activeTeam.name}: ${activeStopWord}` : activeStopWord}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card title={t('player.addSourcesTitle')} subtitle={t('player.addSourcesSubtitle')}>
        <div className="player-form-grid">
          <Field label={t('player.sourceType')} className="min-w-0">
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceType)}>
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

          <Field label={t('player.sourceValue')} className="min-w-0">
            <input value={sourceValue} onChange={(event) => setSourceValue(event.target.value)} placeholder={t('player.playlistUrlOrFolderName')} />
          </Field>

          {sourceType === 'local-folder' && (
            <Button onClick={pickLocalFolder} type="button" variant="ghost">
              {t('player.pickLocalFolder')}
            </Button>
          )}

          <div className="full">
            <Button type="button" onClick={onAddSource} className="w-full sm:w-auto" disabled={!playerName.trim()}>
              {t('player.addSource')}
            </Button>
          </div>
        </div>

        <input
          ref={folderInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={onFolderFilesSelected}
        />

        {localSources.length > 0 && (
          <div className="source-list mt-3">
            {localSources.map((source) => (
              <div className="source-row" key={source.id}>
                <strong>{source.type}</strong>
                <span>{source.value}</span>
                {typeof source.importedCount === 'number' && <span>{source.importedCount} {t('common.tracks')}</span>}
                <span>{source.addedByPlayerName ? t('player.addedBy', { name: source.addedByPlayerName }) : t('player.addedByYou')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('player.roundActions')}>
        <div className="host-actions-grid mb-3">
          <Button onClick={onStop} disabled={!state?.current_round || !teamId} variant="ghost" className="w-full sm:w-auto">
            {t('player.stop')}
          </Button>
          <Button onClick={onToggleReady} disabled={!joinedPlayerId} variant="secondary" className="w-full sm:w-auto">
            {playerReady ? t('player.setNotReady') : t('player.setReady')}
          </Button>
        </div>

        {state?.current_round?.status === 'playing' && (
          <div className="source-row mb-3">
            <Button onClick={onBuzz} disabled={!joinedPlayerId || buzzerTaken} variant="secondary" className="w-full sm:w-auto">
              {buzzerOwnedByMe ? t('player.buzzedFirst') : buzzerTaken ? t('player.buzzerTaken') : buzzButtonLabel}
            </Button>
            {buzzerTaken && state.current_round.buzzer_player_name && (
              <StatusChip tone={buzzerOwnedByMe ? 'ok' : 'warn'}>
                {t('player.firstBuzzer', { name: state.current_round.buzzer_player_name })}
                {state.current_round.buzzer_team_name ? ` (${state.current_round.buzzer_team_name})` : ''}
              </StatusChip>
            )}
          </div>
        )}

        <form onSubmit={onGuess} className="player-form-grid">
          <Field label={t('player.guessTitle')} className="min-w-0">
            <input value={guessTitle} onChange={(e) => setGuessTitle(e.target.value)} placeholder={t('player.songTitlePlaceholder')} />
          </Field>
          <Field label={t('player.guessArtist')} className="min-w-0">
            <input value={guessArtist} onChange={(e) => setGuessArtist(e.target.value)} placeholder={t('player.artistPlaceholder')} />
          </Field>
          <div className="full">
            <Button type="submit" disabled={!state?.current_round?.can_guess || !teamId} className="w-full sm:w-auto">
              {t('player.submitGuess')}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={t('player.liveStatus')}>
        {state?.current_round && <p className="muted-copy">{t('player.roundStatus', { status: state.current_round.status })}</p>}
        {joinedPlayerId && <p className="muted-copy">{t('player.statusLine', { status: playerReady ? t('player.ready') : t('player.notReady') })}</p>}
        {state?.message && <StatusChip className="mt-2">{state.message}</StatusChip>}
        {error && <p className="danger-text mt-2">{error}</p>}
      </Card>
    </main>
  );
}
