import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { GameModeSelectionTab } from '../components/tabs/GameModeSelectionTab';
import { RuleConfigurationTab } from '../components/tabs/RuleConfigurationTab';
import { SourcePlayerControlTab } from '../components/tabs/SourcePlayerControlTab';
import { api } from '../services/api';
import {
  buildFormValuesFromPreset,
  buildModeConfig,
  getDefaultModeFormValues,
  getRequiredPhoneRoundTypes,
  type ModeFormValues,
} from '../services/gameModeFormService';
import {
  ensurePhoneLobby as ensurePhoneLobbyFlow,
  openCustomCard as openCustomCardFlow,
  openPresetCard as openPresetCardFlow,
  saveCurrentPreset as saveCurrentPresetFlow,
} from '../services/hostSetupController';
import {
  addSource,
  cleanupBackendSources,
  extractFolderSelection,
  pickLocalFolderName,
  type LocalSource,
  type SourceType,
} from '../services/mediaSourceController';
import { connectLobbySocket } from '../services/ws';
import type { GameModePresetState, GameState } from '../types';

type SetupTab = 'startscreen' | 'rules' | 'sources';

function parseTeamNames(raw: string): string[] {
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  return Array.from(new Set(names.map((name) => name.toLowerCase())))
    .map((lowered) => names.find((name) => name.toLowerCase() === lowered) as string);
}

export function HostSetupPage() {
  const navigate = useNavigate();
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<SetupTab>('startscreen');

  const [hostName, setHostName] = useState('Host');
  const [setupTeams, setSetupTeams] = useState('Team A, Team B');
  const [localSources, setLocalSources] = useState<LocalSource[]>([]);
  const [newSourceType, setNewSourceType] = useState<SourceType>('local-folder');
  const [newSourceValue, setNewSourceValue] = useState('');
  const [pendingLocalFileCount, setPendingLocalFileCount] = useState<number>(0);

  const [gameModes, setGameModes] = useState<GameModePresetState[]>([]);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('classic_audio');
  const [modeDetailsEditable, setModeDetailsEditable] = useState<boolean>(false);
  const [modeDetailsTitle, setModeDetailsTitle] = useState<string>('Game Mode Details');

  const [modeFormValues, setModeFormValues] = useState<ModeFormValues>(getDefaultModeFormValues());

  const [saveAsPreset, setSaveAsPreset] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');

  const [runtimeTestMode, setRuntimeTestMode] = useState<boolean>(false);
  const [youtubeApiConfigured, setYoutubeApiConfigured] = useState<boolean>(false);
  const [runtimeConfigBusy, setRuntimeConfigBusy] = useState<boolean>(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyAuthBusy, setSpotifyAuthBusy] = useState<boolean>(false);

  const [state, setState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const [startGameBusy, setStartGameBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!state?.lobby_code) return;
    return connectLobbySocket(state.lobby_code, setState);
  }, [state?.lobby_code]);

  useEffect(() => {
    const loadRuntimeConfig = async () => {
      try {
        const result = await api.getRuntimeConfig();
        setRuntimeTestMode(Boolean(result.data.test_mode));
        setYoutubeApiConfigured(Boolean(result.data.youtube_api_key_configured));

        const spotify = await api.getSpotifyStatus();
        setSpotifyConnected(Boolean(spotify.data.connected));

        const modes = await api.getGameModes();
        setGameModes(modes.data);

        if (modes.data.length > 0) {
          const defaultPreset = modes.data.find((preset) => preset.key === 'classic_audio') ?? modes.data[0];
          setSelectedPresetKey(defaultPreset.key);
          setModeDetailsTitle(defaultPreset.name);
          setModeFormValues(buildFormValuesFromPreset(defaultPreset));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void loadRuntimeConfig();
  }, []);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  const onFieldChange = <K extends keyof ModeFormValues>(field: K, value: ModeFormValues[K]) => {
    setModeFormValues((previous) => ({ ...previous, [field]: value }));
  };

  const onSelectPreset = (preset: GameModePresetState) => {
    const next = openPresetCardFlow({ preset });
    setSelectedPresetKey(next.selectedPresetKey);
    setModeDetailsEditable(next.modeDetailsEditable);
    setModeDetailsTitle(next.modeDetailsTitle);
    setModeFormValues(buildFormValuesFromPreset(preset));
    setActiveTab('rules');
    setError(null);
  };

  const onSelectCustom = () => {
    const next = openCustomCardFlow({ gameModes, selectedPresetKey });
    if (next.basePreset) {
      setSelectedPresetKey(next.basePreset.key);
      setModeFormValues(buildFormValuesFromPreset(next.basePreset));
    }
    setModeDetailsEditable(next.modeDetailsEditable);
    setModeDetailsTitle(next.modeDetailsTitle);
    setActiveTab('rules');
    setError(null);
  };

  const onSavePreset = async () => {
    try {
      const modeConfig = buildModeConfig(modeFormValues);
      const next = await saveCurrentPresetFlow({
        presetName: newPresetName,
        modeConfig,
        gameModes,
      });
      setGameModes(next.gameModes);
      setSelectedPresetKey(next.selectedPresetKey);
      setModeFormValues(buildFormValuesFromPreset(next.savedPreset));
      setSaveAsPreset(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onToggleRuntimeTestMode = async (enabled: boolean) => {
    setRuntimeConfigBusy(true);
    try {
      const result = await api.updateRuntimeConfig(enabled);
      setRuntimeTestMode(Boolean(result.data.test_mode));
      setYoutubeApiConfigured(Boolean(result.data.youtube_api_key_configured));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRuntimeConfigBusy(false);
    }
  };

  const connectSpotify = async () => {
    setSpotifyAuthBusy(true);
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
          if (status.data.connected) {
            setSpotifyConnected(true);
            setSpotifyAuthBusy(false);
            window.clearInterval(intervalId);
            if (!popup.closed) {
              popup.close();
            }
          }
        } catch {
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSpotifyAuthBusy(false);
    }
  };

  const addLocalSource = async () => {
    try {
      const source = await addSource({
        sourceType: newSourceType,
        sourceValue: newSourceValue,
        pendingLocalFileCount,
      });
      setLocalSources((previous) => [...previous, source]);
      setNewSourceValue('');
      setPendingLocalFileCount(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeLocalSource = async (sourceId: string) => {
    const source = localSources.find((item) => item.id === sourceId);
    setLocalSources((previous) => previous.filter((item) => item.id !== sourceId));

    if (!source?.backendSourceId) {
      return;
    }

    try {
      await cleanupBackendSources([source.backendSourceId]);
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

    setNewSourceValue(selection.folderName);
    setPendingLocalFileCount(selection.fileCount);
    setError(null);
  };

  const pickLocalFolder = async () => {
    const folderName = await pickLocalFolderName(window);
    if (folderName) {
      setNewSourceValue(folderName);
      setPendingLocalFileCount(1);
      setError(null);
      return;
    }

    folderInputRef.current?.click();
  };

  const ensureLobby = async () => {
    try {
      const modeConfig = buildModeConfig(modeFormValues);
      const teamNames = parseTeamNames(setupTeams);
      const nextState = await ensurePhoneLobbyFlow({
        state: stateRef.current,
        hostName,
        selectedPresetKey,
        modeDetailsTitle,
        modeConfig,
        teamNames,
      });
      setState(nextState);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startGame = async () => {
    setStartGameBusy(true);
    try {
      const modeConfig = buildModeConfig(modeFormValues);
      const teamNames = parseTeamNames(setupTeams);
      const lobbyState = await ensurePhoneLobbyFlow({
        state: stateRef.current,
        hostName,
        selectedPresetKey,
        modeDetailsTitle,
        modeConfig,
        teamNames,
      });

      if (!lobbyState?.lobby_code) {
        throw new Error('Could not create lobby before starting the game.');
      }

      const readiness = await api.validateLobbyStart(lobbyState.lobby_code);
      if (!readiness.data.ready) {
        const details = readiness.data.issues.join(' ');
        throw new Error(details || 'Setup is incomplete. Please finish setup before starting the game.');
      }

      setState(lobbyState);
      setError(null);
      navigate(`/host/lobby/${lobbyState.lobby_code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStartGameBusy(false);
    }
  };

  const requiredPhoneRoundTypes = getRequiredPhoneRoundTypes(modeFormValues);
  const parsedTeamNames = parseTeamNames(setupTeams);
  const hasHostName = hostName.trim().length > 0;
  const hasTeams = parsedTeamNames.length > 0;
  const hasAtLeastOneSource = localSources.length > 0;
  const startGameDisabled = !hasHostName || !hasTeams || (!runtimeTestMode && !hasAtLeastOneSource);
  let startGameHint: string | null = null;
  if (!hasHostName) {
    startGameHint = 'Enter a host name first.';
  } else if (!hasTeams) {
    startGameHint = 'Add at least one team name before starting.';
  } else if (!runtimeTestMode && !hasAtLeastOneSource) {
    startGameHint = 'Add at least one media source or enable test mode before starting.';
  }

  return (
    <main>
      <h1>MusikCheck2 Setup</h1>

      <div className="source-row" style={{ marginBottom: 16 }}>
        <button onClick={() => setActiveTab('startscreen')} disabled={activeTab === 'startscreen'}>
          Startscreen
        </button>
        <button onClick={() => setActiveTab('rules')} disabled={activeTab === 'rules'}>
          Rule Configuration
        </button>
        <button onClick={() => setActiveTab('sources')} disabled={activeTab === 'sources'}>
          Source And Player Control
        </button>
      </div>

      {activeTab === 'startscreen' && (
        <GameModeSelectionTab
          gameModes={gameModes}
          runtimeTestMode={runtimeTestMode}
          runtimeConfigBusy={runtimeConfigBusy}
          youtubeApiConfigured={youtubeApiConfigured}
          spotifyConnected={spotifyConnected}
          spotifyAuthBusy={spotifyAuthBusy}
          onToggleRuntimeTestMode={onToggleRuntimeTestMode}
          onConnectSpotify={connectSpotify}
          onSelectPreset={onSelectPreset}
          onSelectCustom={onSelectCustom}
        />
      )}

      {activeTab === 'rules' && (
        <RuleConfigurationTab
          modeDetailsTitle={modeDetailsTitle}
          modeDetailsEditable={modeDetailsEditable}
          modeFormValues={modeFormValues}
          requiredPhoneRoundTypes={requiredPhoneRoundTypes}
          saveAsPreset={saveAsPreset}
          newPresetName={newPresetName}
          onFieldChange={onFieldChange}
          onSaveAsPresetChange={setSaveAsPreset}
          onNewPresetNameChange={setNewPresetName}
          onSavePreset={onSavePreset}
          onContinue={() => setActiveTab('sources')}
        />
      )}

      {activeTab === 'sources' && (
        <SourcePlayerControlTab
          hostName={hostName}
          setupTeams={setupTeams}
          newSourceType={newSourceType}
          newSourceValue={newSourceValue}
          localSources={localSources}
          state={state}
          startGameBusy={startGameBusy}
          startGameDisabled={startGameDisabled}
          startGameHint={startGameHint}
          folderInputRef={folderInputRef}
          onHostNameChange={setHostName}
          onSetupTeamsChange={setSetupTeams}
          onSourceTypeChange={setNewSourceType}
          onSourceValueChange={setNewSourceValue}
          onPickLocalFolder={pickLocalFolder}
          onAddSource={addLocalSource}
          onRemoveSource={removeLocalSource}
          onFolderFilesSelected={onFolderFilesSelected}
          onEnsureLobby={ensureLobby}
          onStartGame={startGame}
        />
      )}

      {error && <p>{error}</p>}
    </main>
  );
}
