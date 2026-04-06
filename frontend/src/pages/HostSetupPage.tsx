import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';

import { GameModeSelectionTab } from '../components/tabs/GameModeSelectionTab';
import { RuleConfigurationTab } from '../components/tabs/RuleConfigurationTab';
import { SourcePlayerControlTab } from '../components/tabs/SourcePlayerControlTab';
import { Button, Card, StatusChip } from '../components/ui';
import {
  DEFAULT_MODE_DETAILS_TITLE,
  DEFAULT_PRESET_KEY,
  DEFAULT_TEAM_NAMES,
} from '../config/defaults';
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
  extractFolderSelection,
  pickLocalFolderName,
  type LocalSource,
  type SourceType,
} from '../services/mediaSourceController';
import { connectLobbySocket } from '../services/ws';
import type { GameModePresetState, GameState, RoundTypeDefinition, RoundTypeMetadata } from '../types';
import { HomeButton } from '../components/HomeButton';

type SetupTab = 'startscreen' | 'rules' | 'sources';

function normalizeTeamNames(raw: string[]): string[] {
  const names = raw
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  return Array.from(new Set(names.map((name) => name.toLowerCase())))
    .map((lowered) => names.find((name) => name.toLowerCase() === lowered) as string);
}

function normalizeSourceType(raw: string): SourceType {
  if (raw === 'youtube-playlist') return 'youtube-playlist';
  if (raw === 'spotify-playlist') return 'spotify-playlist';
  return 'local-folder';
}

export function HostSetupPage() {
  const navigate = useNavigate();
  const { code = '' } = useParams();
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const launchTransitionTimeoutRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<SetupTab>('startscreen');

  const [setupTeamNames, setSetupTeamNames] = useState<string[]>([...DEFAULT_TEAM_NAMES]);
  const [newTeamName, setNewTeamName] = useState<string>('');
  const [localSources, setLocalSources] = useState<LocalSource[]>([]);
  const [newSourceType, setNewSourceType] = useState<SourceType>('local-folder');
  const [newSourceValue, setNewSourceValue] = useState('');
  const [pendingLocalFileCount, setPendingLocalFileCount] = useState<number>(0);

  const [gameModes, setGameModes] = useState<GameModePresetState[]>([]);
  const [availableRoundTypes, setAvailableRoundTypes] = useState<RoundTypeDefinition[]>([]);
  // Store full round type metadata for dynamic options
  const [roundTypesMetadata, setRoundTypesMetadata] = useState<RoundTypeMetadata[]>([]);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>(DEFAULT_PRESET_KEY);
  const [modeDetailsEditable, setModeDetailsEditable] = useState<boolean>(false);
  const [modeDetailsTitle, setModeDetailsTitle] = useState<string>(DEFAULT_MODE_DETAILS_TITLE);

  const [modeFormValues, setModeFormValues] = useState<ModeFormValues>(getDefaultModeFormValues());

  const [newPresetName, setNewPresetName] = useState<string>('');

  const [runtimeTestMode, setRuntimeTestMode] = useState<boolean>(false);
  const [youtubeApiConfigured, setYoutubeApiConfigured] = useState<boolean>(false);
  const [runtimeConfigBusy, setRuntimeConfigBusy] = useState<boolean>(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyAuthBusy, setSpotifyAuthBusy] = useState<boolean>(false);

  const [state, setState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const isHydratingSetupRef = useRef<boolean>(false);
  const [startGameBusy, setStartGameBusy] = useState<boolean>(false);
  const [launchingGame, setLaunchingGame] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const applyUiError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('expired')) {
      setSessionExpired(true);
      setError('This session has expired after 24 hours. Create a new lobby to continue.');
      return;
    }
    setError(message);
  };

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const lobbyCode = (state?.lobby_code || code || '').trim();
    if (!lobbyCode) return;
    return connectLobbySocket(lobbyCode, setState);
  }, [code, state?.lobby_code]);

  useEffect(() => {
    const lobbyCode = code.trim();
    if (!lobbyCode) {
      navigate('/', { replace: true });
      return;
    }

    const loadRuntimeConfig = async () => {
      try {
        const [runtimeResult, spotifyResult, roundTypesResult, roundTypesMetaResult, modesResult] = await Promise.all([
          api.getRuntimeConfig(),
          api.getSpotifyStatus(),
          api.getRoundTypes(),
          api.getRoundTypesMetadata(),
          api.getGameModes(),
        ]);

        const roundTypes = roundTypesResult.data?.round_types ?? [];
        setAvailableRoundTypes(roundTypes);
        setRoundTypesMetadata(roundTypesMetaResult.data?.round_types ?? []);
        setRuntimeTestMode(Boolean(runtimeResult.data.test_mode));
        setYoutubeApiConfigured(Boolean(runtimeResult.data.youtube_api_key_configured));
        setSpotifyConnected(Boolean(spotifyResult.data.connected));
        setGameModes(modesResult.data);

        isHydratingSetupRef.current = true;
        try {
          const [stateResult, setupResult, sourcesResult] = await Promise.all([
            api.getLobbyState(lobbyCode),
            api.getLobbySetup(lobbyCode),
            api.getLobbySources(lobbyCode),
          ]);

          setState(stateResult.data);
          setSetupTeamNames(normalizeTeamNames(setupResult.data.teams));
          setSelectedPresetKey(setupResult.data.preset_key || stateResult.data.mode_key || DEFAULT_PRESET_KEY);
          setModeDetailsTitle(setupResult.data.mode_title || stateResult.data.mode.name || DEFAULT_MODE_DETAILS_TITLE);
          setModeFormValues(buildFormValuesFromPreset(stateResult.data.mode, roundTypes));
          setSpotifyConnected(Boolean(setupResult.data.spotify_connected));
          setLocalSources(
            sourcesResult.data.map((source) => ({
              id: source.source_id,
              type: normalizeSourceType(source.source_type),
              value: source.source_value,
              backendSourceId: source.source_id,
              importedCount: source.imported_count,
            }))
          );
          setSessionExpired(false);
          setError(null);
        } finally {
          isHydratingSetupRef.current = false;
        }
      } catch (err) {
        applyUiError(err);
      }
    };

    void loadRuntimeConfig();
  }, [code, navigate]);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    const lobbyCode = (state?.lobby_code || code || '').trim();
    if (!lobbyCode || isHydratingSetupRef.current || sessionExpired) {
      return;
    }

    if (availableRoundTypes.length === 0) {
      return;
    }

    const modeConfig = buildModeConfig(modeFormValues, availableRoundTypes);
    const teamNames = normalizeTeamNames(setupTeamNames);
    if (teamNames.length < 1) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        await api.saveLobbySetup(lobbyCode, {
          teams: teamNames,
          preset_key: selectedPresetKey,
          mode_title: modeDetailsTitle,
          mode_config: modeConfig,
          spotify_connected: spotifyConnected,
        });
      } catch {
      }
    }, 800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    code,
    modeDetailsTitle,
    modeFormValues,
    availableRoundTypes,
    selectedPresetKey,
    sessionExpired,
    setupTeamNames,
    spotifyConnected,
    state?.lobby_code,
  ]);

  useEffect(() => {
    return () => {
      if (launchTransitionTimeoutRef.current) {
        window.clearTimeout(launchTransitionTimeoutRef.current);
      }
    };
  }, []);

  const onFieldChange = <K extends keyof ModeFormValues>(field: K, value: ModeFormValues[K]) => {
    setModeFormValues((previous) => ({ ...previous, [field]: value }));
  };

  const onSelectPreset = (preset: GameModePresetState) => {
    const next = openPresetCardFlow({ preset });
    setSelectedPresetKey(next.selectedPresetKey);
    setModeDetailsEditable(next.modeDetailsEditable);
    setModeDetailsTitle(next.modeDetailsTitle);
    setModeFormValues(buildFormValuesFromPreset(preset, availableRoundTypes));
    setActiveTab('rules');
    setError(null);
  };

  const onSelectCustom = () => {
    const next = openCustomCardFlow({ gameModes, selectedPresetKey });
    if (next.basePreset) {
      setSelectedPresetKey(next.basePreset.key);
      setModeFormValues(buildFormValuesFromPreset(next.basePreset, availableRoundTypes));
    }
    setModeDetailsEditable(next.modeDetailsEditable);
    setModeDetailsTitle(next.modeDetailsTitle);
    setActiveTab('rules');
    setError(null);
  };

  const onSavePreset = async () => {
    if (availableRoundTypes.length === 0) {
      return;
    }

    try {
      const modeConfig = buildModeConfig(modeFormValues, availableRoundTypes);
      const next = await saveCurrentPresetFlow({
        presetName: newPresetName,
        modeConfig,
        gameModes,
      });
      setGameModes(next.gameModes);
      setSelectedPresetKey(next.selectedPresetKey);
      setModeFormValues(buildFormValuesFromPreset(next.savedPreset, availableRoundTypes));
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
      applyUiError(err);
      setSpotifyAuthBusy(false);
    }
  };

  const addLocalSource = async () => {
    try {
      const lobbyCode = (state?.lobby_code || code || '').trim();
      const source = await addSource({
        sourceType: newSourceType,
        sourceValue: newSourceValue,
        pendingLocalFileCount,
        lobbyCode,
      });
      setLocalSources((previous) => [...previous, source]);
      setNewSourceValue('');
      setPendingLocalFileCount(0);
      setError(null);
    } catch (err) {
      applyUiError(err);
    }
  };

  const removeLocalSource = async (sourceId: string) => {
    const source = localSources.find((item) => item.id === sourceId);
    setLocalSources((previous) => previous.filter((item) => item.id !== sourceId));

    if (!source?.backendSourceId) {
      return;
    }

    try {
      const lobbyCode = (state?.lobby_code || code || '').trim();
      if (lobbyCode) {
        await api.removeLobbySources(lobbyCode, [source.backendSourceId]);
      }
      setError(null);
    } catch (err) {
      applyUiError(err);
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

  const startGame = async () => {
    if (startGameBusy || launchingGame) {
      return;
    }

    if (availableRoundTypes.length === 0) {
      return;
    }

    setStartGameBusy(true);
    try {
      const modeConfig = buildModeConfig(modeFormValues, availableRoundTypes);
      const teamNames = normalizeTeamNames(setupTeamNames);
      const lobbyState = await ensurePhoneLobbyFlow({
        state: stateRef.current,
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
      setLaunchingGame(true);
      launchTransitionTimeoutRef.current = window.setTimeout(() => {
        navigate(`/host/lobby/${lobbyState.lobby_code}`);
      }, 650);
    } catch (err) {
      setLaunchingGame(false);
      applyUiError(err);
    } finally {
      setStartGameBusy(false);
    }
  };

  const requiredPhoneRoundTypes = getRequiredPhoneRoundTypes(modeFormValues, availableRoundTypes);
  const hasTeams = normalizeTeamNames(setupTeamNames).length > 0;
  const hasAtLeastOneSource = localSources.length > 0;
  const startGameDisabled = !hasTeams || (!runtimeTestMode && !hasAtLeastOneSource);
  let startGameHint: string | null = null;
  if (!hasTeams) {
    startGameHint = 'Add at least one team name before starting.';
  } else if (!runtimeTestMode && !hasAtLeastOneSource) {
    startGameHint = 'Add at least one media source or enable test mode before starting.';
  }

  const addTeam = () => {
    const nextName = newTeamName.trim();
    if (!nextName) {
      return;
    }
    setSetupTeamNames((previous) => {
      const merged = normalizeTeamNames([...previous, nextName]);
      return merged;
    });
    setNewTeamName('');
    setError(null);
  };

  const removeTeam = (teamName: string) => {
    setSetupTeamNames((previous) => previous.filter((name) => name.toLowerCase() !== teamName.toLowerCase()));
    setError(null);
  };

  if (sessionExpired) {
    return (
      <main>
        <Card>
          <h1 className="page-heading">Session Expired</h1>
          <p className="danger-text">{error || 'This lobby is no longer available.'}</p>
          <div className="source-row mt-3">
            <Button onClick={() => navigate('/')}>Go To Home</Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <>
      <main>
        <Card>
          <StatusChip>Round Setup</StatusChip>
          <div className='flex flex-row'>
            <h1 className="page-heading mt-2">MusikCheck 2</h1>
            <div className="ml-auto">
              <HomeButton />
            </div>
          </div>
        </Card>

        <Card>
    
          <div className="tab-header-row mb-4">
            <Button
              className="tab-header-btn"
              onClick={() => setActiveTab('startscreen')}
              disabled={activeTab === 'startscreen'}
              variant={activeTab === 'startscreen' ? 'secondary' : 'ghost'}
            >
              Game Mode
            </Button>
            <Button
              className="tab-header-btn"
              onClick={() => setActiveTab('rules')}
              disabled={activeTab === 'rules'}
              variant={activeTab === 'rules' ? 'secondary' : 'ghost'}
            >
              Rules
            </Button>
            <Button
              className="tab-header-btn"
              onClick={() => setActiveTab('sources')}
              disabled={activeTab === 'sources'}
              variant={activeTab === 'sources' ? 'secondary' : 'ghost'}
            >
              Sources And Players
            </Button>
          </div>

          {activeTab === 'startscreen' && (
            <GameModeSelectionTab
              gameModes={gameModes}
              selectedPresetKey={selectedPresetKey}
              customModeSelected={modeDetailsEditable}
              onSelectPreset={onSelectPreset}
              onSelectCustom={onSelectCustom}
              runtimeConfigBusy={runtimeConfigBusy}
            />
          )}

          {activeTab === 'rules' && (
            <RuleConfigurationTab
              modeDetailsTitle={modeDetailsTitle}
              modeDetailsEditable={modeDetailsEditable}
              modeFormValues={modeFormValues}
              availableRoundTypes={availableRoundTypes}
              roundTypesMetadata={roundTypesMetadata}
              requiredPhoneRoundTypes={requiredPhoneRoundTypes}
              newPresetName={newPresetName}
              onFieldChange={onFieldChange}
              onRoundRuleChange={(roundKind, nextValues) => {
                setModeFormValues((previous) => {
                  const prevRule = previous.roundRules[roundKind] || {};
                  // Merge all fields (enabled, every_n_songs, and dynamic options)
                  return {
                    ...previous,
                    roundRules: {
                      ...previous.roundRules,
                      [roundKind]: {
                        ...prevRule,
                        ...nextValues,
                      },
                    },
                  };
                });
              }}
              onNewPresetNameChange={setNewPresetName}
              onSavePreset={onSavePreset}
              onContinue={() => setActiveTab('sources')}
            />
          )}

          {activeTab === 'sources' && (
            <SourcePlayerControlTab
              setupTeamNames={setupTeamNames}
              newTeamName={newTeamName}
              spotifyConnected={spotifyConnected}
              spotifyAuthBusy={spotifyAuthBusy}
              youtubeApiConfigured={youtubeApiConfigured}
              runtimeTestMode={runtimeTestMode}
              runtimeConfigBusy={runtimeConfigBusy}
              newSourceType={newSourceType}
              newSourceValue={newSourceValue}
              localSources={localSources}
              state={state}
              startGameBusy={startGameBusy}
              startGameDisabled={startGameDisabled}
              startGameHint={startGameHint}
              folderInputRef={folderInputRef}
              onToggleRuntimeTestMode={onToggleRuntimeTestMode}
              onNewTeamNameChange={setNewTeamName}
              onAddTeam={addTeam}
              onRemoveTeam={removeTeam}
              onSourceTypeChange={setNewSourceType}
              onSourceValueChange={setNewSourceValue}
              onConnectSpotify={connectSpotify}
              onPickLocalFolder={pickLocalFolder}
              onAddSource={addLocalSource}
              onRemoveSource={removeLocalSource}
              onFolderFilesSelected={onFolderFilesSelected}
              onStartGame={startGame}
            />
          )}

            {error && <p className="danger-text">{error}</p>}
        </Card>
      </main>

      <AnimatePresence>
        {launchingGame && (
          <motion.div
            className="game-launch-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              className="game-launch-card"
              initial={{ y: 18, scale: 0.96, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <p className="game-launch-title">Lights Up</p>
              <p className="game-launch-subtitle">Moving from setup to the live game floor...</p>
              <motion.div
                className="game-launch-progress"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.55, ease: 'easeInOut' }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
