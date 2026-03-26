import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { RoundPanel } from '../components/RoundPanel';
import { Scoreboard } from '../components/Scoreboard';
import { api } from '../services/api';
import { connectLobbySocket } from '../services/ws';
import type { GameModeConfig, GameModePresetState, GameState } from '../types';

type SetupStep = 'mode-cards' | 'mode-details' | 'game-setup';

type SourceType = 'youtube-playlist' | 'spotify-playlist' | 'local-folder';

type LocalSource = {
  id: string;
  type: SourceType;
  value: string;
  backendSourceId?: string;
  importedCount?: number;
  ingestError?: string;
};

const LOCAL_STAGE_DURATIONS_DEFAULT = [2, 5, 8];
const LOCAL_STAGE_POINTS = [3, 2, 1];
const LOCAL_BOTH_BONUS_POINTS = 1;
const LOCAL_WRONG_GUESS_PENALTY = 1;
const LOCAL_REQUIRED_POINTS_TO_WIN = 15;

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'youtube-playlist', label: 'YouTube Playlist Link' },
  { value: 'spotify-playlist', label: 'Spotify Playlist Link' },
  { value: 'local-folder', label: 'Local Folder' },
];

const ROUND_TYPES_REQUIRING_PHONES = new Set(['lyrics']);
const HOST_SESSION_STORAGE_KEY = 'musikcheck2.host-session-v1';

export function HostPage() {
  const navigate = useNavigate();
  const { code: routeLobbyCode } = useParams();
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [setupStep, setSetupStep] = useState<SetupStep>('mode-cards');
  const [modeDetailsEditable, setModeDetailsEditable] = useState<boolean>(false);
  const [modeDetailsTitle, setModeDetailsTitle] = useState<string>('');
  const [setupTeams, setSetupTeams] = useState('Team A, Team B');
  const [localSources, setLocalSources] = useState<LocalSource[]>([]);
  const [newSourceType, setNewSourceType] = useState<SourceType>('local-folder');
  const [newSourceValue, setNewSourceValue] = useState('');
  const [pendingLocalFileCount, setPendingLocalFileCount] = useState<number>(0);

  const [hostName, setHostName] = useState('Host');
  const [gameModes, setGameModes] = useState<GameModePresetState[]>([]);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('classic_audio');
  const [audioEverySongs, setAudioEverySongs] = useState<string>('1');
  const [videoEverySongs, setVideoEverySongs] = useState<string>('5');
  const [lyricsEverySongs, setLyricsEverySongs] = useState<string>('10');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [lyricsEnabled, setLyricsEnabled] = useState<boolean>(true);
  const [releaseYearFrom, setReleaseYearFrom] = useState<string>('');
  const [releaseYearTo, setReleaseYearTo] = useState<string>('');
  const [language, setLanguage] = useState<string>('');
  const [snippet1Duration, setSnippet1Duration] = useState<string>(String(LOCAL_STAGE_DURATIONS_DEFAULT[0]));
  const [snippet2Duration, setSnippet2Duration] = useState<string>(String(LOCAL_STAGE_DURATIONS_DEFAULT[1]));
  const [snippet3Duration, setSnippet3Duration] = useState<string>(String(LOCAL_STAGE_DURATIONS_DEFAULT[2]));
  const [snippet1Points, setSnippet1Points] = useState<string>(String(LOCAL_STAGE_POINTS[0]));
  const [snippet2Points, setSnippet2Points] = useState<string>(String(LOCAL_STAGE_POINTS[1]));
  const [snippet3Points, setSnippet3Points] = useState<string>(String(LOCAL_STAGE_POINTS[2]));
  const [bothBonusPoints, setBothBonusPoints] = useState<string>(String(LOCAL_BOTH_BONUS_POINTS));
  const [wrongGuessPenalty, setWrongGuessPenalty] = useState<string>(String(LOCAL_WRONG_GUESS_PENALTY));
  const [requiredPointsToWin, setRequiredPointsToWin] = useState<string>(String(LOCAL_REQUIRED_POINTS_TO_WIN));
  const [saveAsPreset, setSaveAsPreset] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtimeTestMode, setRuntimeTestMode] = useState<boolean>(false);
  const [youtubeApiConfigured, setYoutubeApiConfigured] = useState<boolean>(false);
  const [runtimeConfigBusy, setRuntimeConfigBusy] = useState<boolean>(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyAuthBusy, setSpotifyAuthBusy] = useState<boolean>(false);
  const restoredSessionRef = useRef<boolean>(false);
  const sessionHydratedRef = useRef<boolean>(false);
  const hostRuntimeSyncTimerRef = useRef<number | null>(null);
  const lastHostRuntimeHashRef = useRef<string>('');

  const providerKeyByType: Record<SourceType, string> = {
    'youtube-playlist': 'youtube_playlist',
    'spotify-playlist': 'spotify_playlist',
    'local-folder': 'local_files',
  };


  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HOST_SESSION_STORAGE_KEY);
      if (!raw) {
        sessionHydratedRef.current = true;
        return;
      }

      const session = JSON.parse(raw) as Record<string, unknown>;
      restoredSessionRef.current = true;

      if (typeof session.setupStep === 'string') {
        setSetupStep(session.setupStep as SetupStep);
      }
      if (typeof session.modeDetailsEditable === 'boolean') {
        setModeDetailsEditable(session.modeDetailsEditable);
      }
      if (typeof session.modeDetailsTitle === 'string') {
        setModeDetailsTitle(session.modeDetailsTitle);
      }
      if (typeof session.setupTeams === 'string') {
        setSetupTeams(session.setupTeams);
      }
      if (Array.isArray(session.localSources)) {
        setLocalSources(session.localSources as LocalSource[]);
      }
      if (!Array.isArray(session.localSources) && session.compactCurrentSource && typeof session.compactCurrentSource === 'object') {
        setLocalSources([session.compactCurrentSource as LocalSource]);
      }
      if (typeof session.hostName === 'string') {
        setHostName(session.hostName);
      }
      if (typeof session.selectedPresetKey === 'string') {
        setSelectedPresetKey(session.selectedPresetKey);
      }
      if (typeof session.audioEverySongs === 'string') {
        setAudioEverySongs(session.audioEverySongs);
      }
      if (typeof session.videoEverySongs === 'string') {
        setVideoEverySongs(session.videoEverySongs);
      }
      if (typeof session.lyricsEverySongs === 'string') {
        setLyricsEverySongs(session.lyricsEverySongs);
      }
      if (typeof session.audioEnabled === 'boolean') {
        setAudioEnabled(session.audioEnabled);
      }
      if (typeof session.videoEnabled === 'boolean') {
        setVideoEnabled(session.videoEnabled);
      }
      if (typeof session.lyricsEnabled === 'boolean') {
        setLyricsEnabled(session.lyricsEnabled);
      }
      if (typeof session.releaseYearFrom === 'string') {
        setReleaseYearFrom(session.releaseYearFrom);
      }
      if (typeof session.releaseYearTo === 'string') {
        setReleaseYearTo(session.releaseYearTo);
      }
      if (typeof session.language === 'string') {
        setLanguage(session.language);
      }
      if (typeof session.snippet1Duration === 'string') {
        setSnippet1Duration(session.snippet1Duration);
      }
      if (typeof session.snippet2Duration === 'string') {
        setSnippet2Duration(session.snippet2Duration);
      }
      if (typeof session.snippet3Duration === 'string') {
        setSnippet3Duration(session.snippet3Duration);
      }
      if (typeof session.snippet1Points === 'string') {
        setSnippet1Points(session.snippet1Points);
      }
      if (typeof session.snippet2Points === 'string') {
        setSnippet2Points(session.snippet2Points);
      }
      if (typeof session.snippet3Points === 'string') {
        setSnippet3Points(session.snippet3Points);
      }
      if (typeof session.bothBonusPoints === 'string') {
        setBothBonusPoints(session.bothBonusPoints);
      }
      if (typeof session.wrongGuessPenalty === 'string') {
        setWrongGuessPenalty(session.wrongGuessPenalty);
      }
      if (typeof session.requiredPointsToWin === 'string') {
        setRequiredPointsToWin(session.requiredPointsToWin);
      }
      if (session.state && typeof session.state === 'object') {
        const restoredState = session.state as GameState;
        setState(restoredState);
        if (restoredState.lobby_code && !routeLobbyCode) {
          navigate(`/host/${restoredState.lobby_code}`, { replace: true });
        }
      }
    } catch {
      window.localStorage.removeItem(HOST_SESSION_STORAGE_KEY);
    } finally {
      sessionHydratedRef.current = true;
    }
  }, [navigate, routeLobbyCode]);

  useEffect(() => {
    if (!sessionHydratedRef.current) {
      return;
    }

    const snapshot = {
      setupStep,
      modeDetailsEditable,
      modeDetailsTitle,
      setupTeams,
      localSources,
      hostName,
      selectedPresetKey,
      audioEverySongs,
      videoEverySongs,
      lyricsEverySongs,
      audioEnabled,
      videoEnabled,
      lyricsEnabled,
      releaseYearFrom,
      releaseYearTo,
      language,
      snippet1Duration,
      snippet2Duration,
      snippet3Duration,
      snippet1Points,
      snippet2Points,
      snippet3Points,
      bothBonusPoints,
      wrongGuessPenalty,
      requiredPointsToWin,
      state,
    };
    try {
      window.localStorage.setItem(HOST_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
    }
  }, [
    setupStep,
    modeDetailsEditable,
    modeDetailsTitle,
    setupTeams,
    localSources,
    hostName,
    selectedPresetKey,
    audioEverySongs,
    videoEverySongs,
    lyricsEverySongs,
    audioEnabled,
    videoEnabled,
    lyricsEnabled,
    releaseYearFrom,
    releaseYearTo,
    language,
    snippet1Duration,
    snippet2Duration,
    snippet3Duration,
    snippet1Points,
    snippet2Points,
    snippet3Points,
    bothBonusPoints,
    wrongGuessPenalty,
    requiredPointsToWin,
    state,
  ]);

  const applyPresetToForm = (preset: GameModePresetState) => {
    const audioRule = preset.round_rules.find((rule) => rule.kind === 'audio');
    const videoRule = preset.round_rules.find((rule) => rule.kind === 'video');
    const lyricsRule = preset.round_rules.find((rule) => rule.kind === 'lyrics');

    setAudioEnabled(Boolean(audioRule));
    setVideoEnabled(Boolean(videoRule));
    setLyricsEnabled(Boolean(lyricsRule));
    setAudioEverySongs(audioRule ? String(audioRule.every_n_songs) : '0');
    setVideoEverySongs(videoRule ? String(videoRule.every_n_songs) : '0');
    setLyricsEverySongs(lyricsRule ? String(lyricsRule.every_n_songs) : '0');
    setReleaseYearFrom(
      typeof preset.filters.release_year_from === 'number' ? String(preset.filters.release_year_from) : '',
    );
    setReleaseYearTo(typeof preset.filters.release_year_to === 'number' ? String(preset.filters.release_year_to) : '');
    setLanguage(preset.filters.language ?? '');
    setSnippet1Duration(String(preset.stage_durations[0] ?? LOCAL_STAGE_DURATIONS_DEFAULT[0]));
    setSnippet2Duration(String(preset.stage_durations[1] ?? LOCAL_STAGE_DURATIONS_DEFAULT[1]));
    setSnippet3Duration(String(preset.stage_durations[2] ?? LOCAL_STAGE_DURATIONS_DEFAULT[2]));
    setSnippet1Points(String(preset.stage_points[0] ?? LOCAL_STAGE_POINTS[0]));
    setSnippet2Points(String(preset.stage_points[1] ?? LOCAL_STAGE_POINTS[1]));
    setSnippet3Points(String(preset.stage_points[2] ?? LOCAL_STAGE_POINTS[2]));
    setBothBonusPoints(String(preset.bonus_points_both ?? LOCAL_BOTH_BONUS_POINTS));
    setWrongGuessPenalty(String(preset.wrong_guess_penalty ?? LOCAL_WRONG_GUESS_PENALTY));
    setRequiredPointsToWin(String(preset.required_points_to_win ?? LOCAL_REQUIRED_POINTS_TO_WIN));
  };

  const activeRoundTypes = [
    audioEnabled ? 'audio' : null,
    videoEnabled ? 'video' : null,
    lyricsEnabled ? 'lyrics' : null,
  ].filter(Boolean) as string[];

  const requiredPhoneRoundTypes = activeRoundTypes.filter((roundType) => ROUND_TYPES_REQUIRING_PHONES.has(roundType));
  const modeRequiresPhoneConnections = requiredPhoneRoundTypes.length > 0;

  const getConfiguredStageDurations = (): number[] => {
    const values = [snippet1Duration, snippet2Duration, snippet3Duration].map((value) => Number.parseInt(value, 10));
    return values.map((value, index) =>
      Number.isFinite(value) && value > 0 ? value : LOCAL_STAGE_DURATIONS_DEFAULT[index],
    );
  };

  const buildModeConfig = (): GameModeConfig => {
    const stageDurations = [snippet1Duration, snippet2Duration, snippet3Duration].map((value) =>
      Number.parseInt(value, 10),
    );
    const stagePoints = [snippet1Points, snippet2Points, snippet3Points].map((value) => Number.parseInt(value, 10));
    const rules: { kind: string; every_n_songs: number }[] = [];

    const audioEvery = Number.parseInt(audioEverySongs, 10);
    const videoEvery = Number.parseInt(videoEverySongs, 10);
    const lyricsEvery = Number.parseInt(lyricsEverySongs, 10);

    if (audioEnabled && Number.isFinite(audioEvery) && audioEvery > 0) {
      rules.push({ kind: 'audio', every_n_songs: audioEvery });
    }
    if (videoEnabled && Number.isFinite(videoEvery) && videoEvery > 0) {
      rules.push({ kind: 'video', every_n_songs: videoEvery });
    }
    if (lyricsEnabled && Number.isFinite(lyricsEvery) && lyricsEvery > 0) {
      rules.push({ kind: 'lyrics', every_n_songs: lyricsEvery });
    }

    if (rules.length < 1) {
      throw new Error('Enable at least one round type by setting its frequency to 1 or higher.');
    }

    const fromYear = Number.parseInt(releaseYearFrom, 10);
    const toYear = Number.parseInt(releaseYearTo, 10);
    const bothBonus = Number.parseInt(bothBonusPoints, 10);
    const wrongPenalty = Number.parseInt(wrongGuessPenalty, 10);
    const winRequired = Number.parseInt(requiredPointsToWin, 10);

    if (stageDurations.some((value) => !Number.isFinite(value) || value < 1)) {
      throw new Error('Snippet durations must be whole numbers >= 1 second.');
    }
    if (stagePoints.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error('Points per snippet must be a whole number >= 0.');
    }
    if (!Number.isFinite(bothBonus) || bothBonus < 0) {
      throw new Error('Bonus points for both must be a whole number >= 0.');
    }
    if (!Number.isFinite(wrongPenalty) || wrongPenalty < 0) {
      throw new Error('Wrong-guess penalty must be a whole number >= 0.');
    }
    if (!Number.isFinite(winRequired) || winRequired < 1) {
      throw new Error('Required points to win must be a whole number >= 1.');
    }

    return {
      stage_durations: stageDurations,
      stage_points: stagePoints,
      bonus_points_both: bothBonus,
      wrong_guess_penalty: wrongPenalty,
      required_points_to_win: winRequired,
      round_rules: rules,
      filters: {
        release_year_from: Number.isFinite(fromYear) ? fromYear : null,
        release_year_to: Number.isFinite(toYear) ? toYear : null,
        language: language.trim() || null,
      },
    };
  };

  const openPresetCard = (preset: GameModePresetState) => {
    setSelectedPresetKey(preset.key);
    setModeDetailsEditable(false);
    setModeDetailsTitle(preset.name);
    applyPresetToForm(preset);
    setSetupStep('mode-details');
    setError(null);
  };

  const openCustomCard = () => {
    const basePreset = gameModes.find((preset) => preset.key === selectedPresetKey) ?? gameModes[0] ?? null;
    if (basePreset) {
      applyPresetToForm(basePreset);
      setSelectedPresetKey(basePreset.key);
    }
    setModeDetailsEditable(true);
    setModeDetailsTitle('Custom Game');
    setSetupStep('mode-details');
    setError(null);
  };

  const ensurePhoneLobby = async (): Promise<string> => {
    if (state?.lobby_code) {
      return state.lobby_code;
    }

    const modeConfig = buildModeConfig();
    const result = await api.createLobby({
      host_name: hostName,
      preset_key: selectedPresetKey,
      mode_config: modeConfig,
      save_as_preset: false,
      preset_name: modeDetailsTitle || undefined,
    });
    setState(result.data);
    navigate(`/host/${result.data.lobby_code}`, { replace: true });
    return result.data.lobby_code;
  };

  const continueToGameSetup = async () => {
    setSetupStep('game-setup');
    try {
      await ensurePhoneLobby();
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('spotify')) {
        setSpotifyConnected(false);
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (!state?.lobby_code) return;
    return connectLobbySocket(state.lobby_code, setState);
  }, [state?.lobby_code]);

  useEffect(() => {
    if (!routeLobbyCode) return;

    let cancelled = false;
    const hydrateLobby = async () => {
      try {
        const result = await api.getLobbyState(routeLobbyCode);
        if (cancelled) {
          return;
        }
        const hydratedState = result.data;
        setState(hydratedState);
        setSetupStep('game-setup');
        setSelectedPresetKey(hydratedState.mode.key);
        setModeDetailsTitle(hydratedState.mode.name);
        applyPresetToForm(hydratedState.mode);

        // Sync scoring/config from backend so reload lands on the same game context.
        setSnippet1Duration(String(hydratedState.mode.stage_durations[0] ?? LOCAL_STAGE_DURATIONS_DEFAULT[0]));
        setSnippet2Duration(String(hydratedState.mode.stage_durations[1] ?? LOCAL_STAGE_DURATIONS_DEFAULT[1]));
        setSnippet3Duration(String(hydratedState.mode.stage_durations[2] ?? LOCAL_STAGE_DURATIONS_DEFAULT[2]));
        setSnippet1Points(String(hydratedState.mode.stage_points[0] ?? LOCAL_STAGE_POINTS[0]));
        setSnippet2Points(String(hydratedState.mode.stage_points[1] ?? LOCAL_STAGE_POINTS[1]));
        setSnippet3Points(String(hydratedState.mode.stage_points[2] ?? LOCAL_STAGE_POINTS[2]));
        setRequiredPointsToWin(String(hydratedState.mode.required_points_to_win ?? LOCAL_REQUIRED_POINTS_TO_WIN));

        let restoredFromBackendHostRuntime = false;
        const backendHostRuntime = hydratedState.host_runtime_state;
        if (backendHostRuntime && typeof backendHostRuntime === 'object') {
          const runtime = backendHostRuntime as Record<string, unknown>;
          restoredFromBackendHostRuntime = true;

          if (typeof runtime.setupStep === 'string') {
            setSetupStep(runtime.setupStep as SetupStep);
          }
          if (Array.isArray(runtime.localSources)) {
            setLocalSources(runtime.localSources as LocalSource[]);
          }
        }
        setError(null);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          const normalized = message.toLowerCase();
          if (normalized.includes('lobby not found') || normalized.includes('unknown game mode preset')) {
            setState(null);
            setSetupStep('mode-cards');
            window.localStorage.removeItem(HOST_SESSION_STORAGE_KEY);
            navigate('/host', { replace: true });
          }
          setError(message);
        }
      }
    };

    void hydrateLobby();
    return () => {
      cancelled = true;
    };
  }, [navigate, routeLobbyCode]);

  useEffect(() => {
    if (!sessionHydratedRef.current) {
      return;
    }
    if (!state?.lobby_code) {
      return;
    }

    const compactHostRuntimeSnapshot: Record<string, unknown> = {
      setupStep,
      modeDetailsTitle,
      selectedPresetKey,
      hostName,
      localSources,
      requiredPointsToWin,
      snippet1Points,
      snippet2Points,
      snippet3Points,
      bothBonusPoints,
      wrongGuessPenalty,
    };

    const snapshotHash = JSON.stringify(compactHostRuntimeSnapshot);
    if (lastHostRuntimeHashRef.current === snapshotHash) {
      return;
    }

    if (hostRuntimeSyncTimerRef.current !== null) {
      window.clearTimeout(hostRuntimeSyncTimerRef.current);
      hostRuntimeSyncTimerRef.current = null;
    }

    hostRuntimeSyncTimerRef.current = window.setTimeout(() => {
      const code = state.lobby_code;
      void api
        .saveHostRuntimeState(code, compactHostRuntimeSnapshot)
        .then(() => {
          lastHostRuntimeHashRef.current = snapshotHash;
        })
        .catch(() => {
        });
      hostRuntimeSyncTimerRef.current = null;
    }, 450);

    return () => {
      if (hostRuntimeSyncTimerRef.current !== null) {
        window.clearTimeout(hostRuntimeSyncTimerRef.current);
        hostRuntimeSyncTimerRef.current = null;
      }
    };
  }, [
    state?.lobby_code,
    setupStep,
    modeDetailsTitle,
    selectedPresetKey,
    hostName,
    localSources,
    requiredPointsToWin,
    snippet1Points,
    snippet2Points,
    snippet3Points,
    bothBonusPoints,
    wrongGuessPenalty,
  ]);

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
        if (modes.data.length > 0 && !restoredSessionRef.current) {
          const defaultPreset = modes.data.find((preset) => preset.key === 'classic_audio') ?? modes.data[0];
          setSelectedPresetKey(defaultPreset.key);
          applyPresetToForm(defaultPreset);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void loadRuntimeConfig();
  }, []);

  useEffect(() => {
    if (gameModes.length < 1) {
      return;
    }

    // Do not override an active lobby's mode (custom modes may not exist in preset list).
    if (state?.lobby_code) {
      return;
    }

    const keyExists = gameModes.some((preset) => preset.key === selectedPresetKey);
    if (keyExists) {
      return;
    }

    const fallbackPreset = gameModes.find((preset) => preset.key === 'classic_audio') ?? gameModes[0];
    setSelectedPresetKey(fallbackPreset.key);
    applyPresetToForm(fallbackPreset);
  }, [gameModes, selectedPresetKey, state?.lobby_code]);

  const saveCurrentPreset = async () => {
    const name = newPresetName.trim();
    if (!name) {
      setError('Enter a preset name first.');
      return;
    }

    try {
      const modeConfig = buildModeConfig();
      const result = await api.createGameModePreset(name, modeConfig);
      const savedPreset = result.data.preset;
      setGameModes((previous) => {
        const withoutDuplicate = previous.filter((item) => item.key !== savedPreset.key);
        return [...withoutDuplicate, savedPreset];
      });
      setSelectedPresetKey(savedPreset.key);
      applyPresetToForm(savedPreset);
      setSaveAsPreset(false);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('spotify')) {
        setSpotifyConnected(false);
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startLocalGame = () => {
    if (modeRequiresPhoneConnections && (state?.players.length ?? 0) < 1) {
      setError('This game mode requires phones. At least one phone must be connected before starting.');
      return;
    }

    const names = setupTeams
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length < 1) {
      setError('Please enter at least one team name.');
      return;
    }

    const begin = async () => {
      const lobbyCode = await ensurePhoneLobby();
      const teamsState = await api.setLobbyTeams(lobbyCode, names);
      setState(teamsState.data);

      const roundState = await api.startRound(lobbyCode);
      setState(roundState.data);

      setError(null);
    };

    void begin().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  const addLocalSource = async () => {
    if (!newSourceValue.trim()) {
      setError('Please enter a source value before adding.');
      return;
    }

    const sourceType = newSourceType;
    const sourceValue = newSourceValue.trim();

    if (sourceType === 'local-folder') {
      if (!sourceValue || pendingLocalFileCount < 1) {
        setError('Please choose a local folder first.');
        return;
      }

      try {
        const registered = await api.registerLocalSource(sourceValue);
        const sourceState = registered.data.source;
        const indexed = await api.runLocalSourceIndex(sourceState.id);

        setLocalSources((previous) => [
          ...previous,
          {
            id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: sourceType,
            value: sourceValue,
            backendSourceId: sourceState.id,
            importedCount: indexed.data.total_tracks,
          },
        ]);
        setNewSourceValue('');
        setPendingLocalFileCount(0);
        setError(null);
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
    }

    try {
      const registered = await api.registerSource(providerKeyByType[sourceType], sourceValue);
      const sourceState = registered.data.source;
      const synced = await api.runSourceSync(sourceState.id);
      const importedCount = Number(synced.data.total_tracks ?? 0);

      setLocalSources((previous) => [
        ...previous,
        {
          id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: sourceType,
          value: sourceValue,
          backendSourceId: sourceState.id,
          importedCount,
        },
      ]);
      setNewSourceValue('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const updateLocalSource = (sourceId: string, patch: Partial<Pick<LocalSource, 'type' | 'value'>>) => {
    setLocalSources((previous) => previous.map((source) => (source.id === sourceId ? { ...source, ...patch } : source)));
  };

  const cleanupBackendSources = async (sourceIds: string[]) => {
    if (sourceIds.length < 1) {
      return;
    }

    await api.cleanupSources(sourceIds);
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
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length < 1) {
      return;
    }

    const firstRelativePath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
    const folderName = firstRelativePath.includes('/') ? firstRelativePath.split('/')[0] : files[0].name;
    setNewSourceValue(folderName || 'selected-folder');
    setPendingLocalFileCount(files.length);
    setError(null);
  };

  const pickLocalFolder = async () => {
    const windowWithDirectoryPicker = window as Window & {
      showDirectoryPicker?: () => Promise<{ name: string }>;
    };

    if (windowWithDirectoryPicker.showDirectoryPicker) {
      try {
        const handle = await windowWithDirectoryPicker.showDirectoryPicker();
        setNewSourceValue(handle.name);
        setPendingLocalFileCount(1);
        setError(null);
        return;
      } catch {
        return;
      }
    }

    folderInputRef.current?.click();
  };

  const resetToMenu = () => {
    const sourceIdsToCleanup = localSources
      .map((source) => source.backendSourceId)
      .filter(Boolean) as string[];
    void cleanupBackendSources(sourceIdsToCleanup).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });

    setSetupStep('mode-cards');
    setModeDetailsEditable(false);
    setModeDetailsTitle('');
    setState(null);
    setLocalSources([]);
    setError(null);
    restoredSessionRef.current = false;
    lastHostRuntimeHashRef.current = '';
    if (hostRuntimeSyncTimerRef.current !== null) {
      window.clearTimeout(hostRuntimeSyncTimerRef.current);
      hostRuntimeSyncTimerRef.current = null;
    }
    window.localStorage.removeItem(HOST_SESSION_STORAGE_KEY);
    navigate('/host', { replace: true });
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
        setError('Popup was blocked. Please allow popups for Spotify login.');
        setSpotifyAuthBusy(false);
        return;
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

  const refreshSpotifyStatus = async () => {
    try {
      const status = await api.getSpotifyStatus();
      setSpotifyConnected(Boolean(status.data.connected));
    } catch {
    }
  };

  useEffect(() => {
    void refreshSpotifyStatus();

    const pollId = window.setInterval(() => {
      void refreshSpotifyStatus();
    }, 15000);

    const onWindowFocus = () => {
      void refreshSpotifyStatus();
    };

    window.addEventListener('focus', onWindowFocus);
    return () => {
      window.clearInterval(pollId);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, []);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  const gameStarted = Boolean(state && (state.teams.length > 0 || state.current_round));

  const startBackendRound = async () => {
    if (!state?.lobby_code) {
      return;
    }
    try {
      const result = await api.startRound(state.lobby_code);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const nextBackendStage = async () => {
    if (!state?.lobby_code) {
      return;
    }
    try {
      const result = await api.nextStage(state.lobby_code);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleTeamFact = async (teamId: string, fact: 'artist' | 'title') => {
    if (!state?.lobby_code) {
      return;
    }
    try {
      const result = await api.toggleTeamFact(state.lobby_code, teamId, fact);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyWrongGuess = async (teamId: string) => {
    if (!state?.lobby_code) {
      return;
    }
    try {
      const result = await api.applyWrongGuessPenalty(state.lobby_code, teamId);
      setState(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main>
      <h1>MusikCheck2 Host</h1>
      <p>
        Spotify: {spotifyConnected ? 'Connected' : 'Not connected'}
        <button onClick={connectSpotify} disabled={spotifyAuthBusy} style={{ marginLeft: 8 }}>
          {spotifyAuthBusy ? 'Connecting...' : spotifyConnected ? 'Reconnect Spotify' : 'Connect Spotify'}
        </button>
      </p>

      {!gameStarted && setupStep === 'mode-cards' && (
        <section>
          <h3>Select Game Mode</h3>
          <p>Choose a preset card or create a custom game mode.</p>
          <label>
            <input
              type="checkbox"
              checked={runtimeTestMode}
              onChange={(event: ChangeEvent<HTMLInputElement>) => void onToggleRuntimeTestMode(event.target.checked)}
              disabled={runtimeConfigBusy}
            />
            Test mode (placeholder snippets)
          </label>
          {!runtimeTestMode && !youtubeApiConfigured && (
            <p>YouTube API key is not configured; real YouTube ingestion will fail.</p>
          )}
          <div className="source-list">
            {gameModes.map((preset) => (
              <button key={preset.key} className="source-row" onClick={() => openPresetCard(preset)}>
                <strong>{preset.name}</strong>
                <span>{preset.requires_phone_connections ? 'Contains phone-required rounds' : 'No phone-required rounds'}</span>
              </button>
            ))}
            <button className="source-row" onClick={openCustomCard}>
              <strong>Custom Game</strong>
              <span>Create your own round mix and frequencies</span>
            </button>
          </div>
        </section>
      )}

      {!gameStarted && setupStep === 'mode-details' && (
        <section>
          <h3>{modeDetailsTitle || 'Game Mode Details'}</h3>
          <p>
            {modeDetailsEditable
              ? 'Configure round types and frequencies.'
              : 'Preset settings are read-only. You can continue or go back.'}
          </p>

          <div className="source-row">
            <label>
              <input
                type="checkbox"
                checked={audioEnabled}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setAudioEnabled(event.target.checked)}
              />
              Audio rounds
            </label>
            <label>
              <input
                type="checkbox"
                checked={videoEnabled}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setVideoEnabled(event.target.checked)}
              />
              Video rounds
            </label>
            <label>
              <input
                type="checkbox"
                checked={lyricsEnabled}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setLyricsEnabled(event.target.checked)}
              />
              Lyrics rounds
            </label>
          </div>

          <div className="source-list">
            {audioEnabled && (
              <label>
                Audio frequency (every N songs)
                <input
                  type="number"
                  min={1}
                  value={audioEverySongs}
                  disabled={!modeDetailsEditable}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setAudioEverySongs(event.target.value)}
                />
              </label>
            )}
            {videoEnabled && (
              <label>
                Video frequency (every N songs)
                <input
                  type="number"
                  min={1}
                  value={videoEverySongs}
                  disabled={!modeDetailsEditable}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setVideoEverySongs(event.target.value)}
                />
              </label>
            )}
            {lyricsEnabled && (
              <label>
                Lyrics frequency (every N songs)
                <input
                  type="number"
                  min={1}
                  value={lyricsEverySongs}
                  disabled={!modeDetailsEditable}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setLyricsEverySongs(event.target.value)}
                />
              </label>
            )}
          </div>

          <div className="source-row">
            <label>
              Release year from
              <input
                type="number"
                value={releaseYearFrom}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setReleaseYearFrom(event.target.value)}
              />
            </label>
            <label>
              Release year to
              <input
                type="number"
                value={releaseYearTo}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setReleaseYearTo(event.target.value)}
              />
            </label>
            <label>
              Language
              <input
                value={language}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setLanguage(event.target.value)}
              />
            </label>
          </div>

          <div className="source-row">
            <label>
              Snippet 1 duration (s)
              <input
                type="number"
                min={1}
                value={snippet1Duration}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSnippet1Duration(event.target.value)}
              />
            </label>
            <label>
              Snippet 2 duration (s)
              <input
                type="number"
                min={1}
                value={snippet2Duration}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSnippet2Duration(event.target.value)}
              />
            </label>
            <label>
              Snippet 3 duration (s)
              <input
                type="number"
                min={1}
                value={snippet3Duration}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSnippet3Duration(event.target.value)}
              />
            </label>
          </div>

          <div className="source-row">
            <label>
              Snippet 1 points
              <input
                type="number"
                min={0}
                value={snippet1Points}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSnippet1Points(event.target.value)}
              />
            </label>
            <label>
              Snippet 2 points
              <input
                type="number"
                min={0}
                value={snippet2Points}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSnippet2Points(event.target.value)}
              />
            </label>
            <label>
              Snippet 3 points
              <input
                type="number"
                min={0}
                value={snippet3Points}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSnippet3Points(event.target.value)}
              />
            </label>
          </div>

          <div className="source-row">
            <label>
              Bonus (artist + title)
              <input
                type="number"
                min={0}
                value={bothBonusPoints}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setBothBonusPoints(event.target.value)}
              />
            </label>
            <label>
              Wrong guess penalty
              <input
                type="number"
                min={0}
                value={wrongGuessPenalty}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setWrongGuessPenalty(event.target.value)}
              />
            </label>
            <label>
              Required points to win
              <input
                type="number"
                min={1}
                value={requiredPointsToWin}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setRequiredPointsToWin(event.target.value)}
              />
            </label>
          </div>

          {requiredPhoneRoundTypes.length > 0 && (
            <p>Round type {requiredPhoneRoundTypes.join(', ')} requires phones to be connected.</p>
          )}

          {modeDetailsEditable && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={saveAsPreset}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSaveAsPreset(event.target.checked)}
                />
                Save this setup as a new preset
              </label>
              <label>
                Preset name
                <input
                  value={newPresetName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setNewPresetName(event.target.value)}
                  placeholder="My custom mode"
                />
              </label>
              <button onClick={saveCurrentPreset}>Save Preset Now</button>
            </>
          )}

          <button onClick={() => setSetupStep('mode-cards')}>Back</button>
          <button onClick={continueToGameSetup}>Continue</button>
        </section>
      )}

      {setupStep === 'game-setup' && !gameStarted && (
        <section>
          <h3>Game Setup</h3>
          <p>
            Game mode: {state?.mode?.name || modeDetailsTitle || (gameModes.find((preset) => preset.key === selectedPresetKey)?.name ?? selectedPresetKey)}
          </p>
          <p>Phones: {modeRequiresPhoneConnections ? 'Required' : 'Optional'}</p>
          <label>
            Host name
            <input value={hostName} onChange={(event: ChangeEvent<HTMLInputElement>) => setHostName(event.target.value)} />
          </label>
          <p>
            Phone lobby code:{' '}
            <strong>{state?.lobby_code ?? 'Not created'}</strong>
            <button onClick={() => void ensurePhoneLobby()} style={{ marginLeft: 8 }}>
              {state?.lobby_code ? 'Refresh Lobby' : 'Create Phone Lobby'}
            </button>
          </p>
          {state?.lobby_code && (
            <p>
              Players join at <strong>/player/{state.lobby_code}</strong>
            </p>
          )}
          <h4>Connected Phones</h4>
          {state?.players.length ? (
            <ul>
              {state.players.map((player) => (
                <li key={player.id}>
                  {player.name} — {player.ready ? 'ready' : 'not ready'}
                </li>
              ))}
            </ul>
          ) : (
            <p>No phones connected yet.</p>
          )}

          <p>Enter team names separated by commas.</p>
          <input
            value={setupTeams}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSetupTeams(event.target.value)}
          />

          <h4>Sources</h4>
          {localSources.length > 0 && (
            <div className="source-list">
              {localSources.map((source) => (
                <div key={source.id} className="source-row">
                  <select
                    value={source.type}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      updateLocalSource(source.id, { type: event.target.value as SourceType })
                    }
                  >
                    {SOURCE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={source.value}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateLocalSource(source.id, { value: event.target.value })
                    }
                    placeholder="Source value"
                  />
                  <span>{source.importedCount !== undefined ? `${source.importedCount} imported` : ''}</span>
                  <button onClick={() => removeLocalSource(source.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}

          <div className="source-add-block">
            <select
              value={newSourceType}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setNewSourceType(event.target.value as SourceType);
                setNewSourceValue('');
                setPendingLocalFileCount(0);
              }}
            >
              {SOURCE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {newSourceType === 'local-folder' ? (
              <>
                <button onClick={pickLocalFolder}>Choose Folder</button>
                <input value={newSourceValue} readOnly placeholder="No folder selected" />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={onFolderFilesSelected}
                />
              </>
            ) : (
              <input
                value={newSourceValue}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setNewSourceValue(event.target.value)}
                placeholder="Paste playlist link"
              />
            )}

            <button onClick={addLocalSource}>Add Source</button>
          </div>

          <button onClick={startLocalGame} disabled={modeRequiresPhoneConnections && (state?.players.length ?? 0) < 1}>
            Start Game
          </button>
          <button onClick={() => setSetupStep('mode-details')}>Back</button>
          <button onClick={resetToMenu}>Back to Cards</button>
        </section>
      )}

      {gameStarted && (
        <section className="single-tv-screen" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'start' }}>
            <RoundPanel
              round={state?.current_round ?? null}
              teams={state?.teams ?? []}
              onStart={() => void startBackendRound()}
              onNextStage={() => void nextBackendStage()}
              onToggleFact={(teamId, fact) => void toggleTeamFact(teamId, fact)}
              onApplyWrongGuess={(teamId) => void applyWrongGuess(teamId)}
              onError={setError}
            />
            <Scoreboard teams={state?.teams ?? []} />
          </div>

          {state?.message && (
            <div style={{ padding: '16px', backgroundColor: '#e3f2fd', borderLeft: '4px solid #2196F3', borderRadius: '4px' }}>
              <p style={{ margin: '0', fontSize: '14px', color: '#1565c0' }}>{state.message}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
            <button
              onClick={() => void startBackendRound()}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ▶ Next Song
            </button>
            <button
              className="quit-button"
              onClick={resetToMenu}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ⏹ Quit Game
            </button>
          </div>
        </section>
      )}

      {error && <p>{error}</p>}
    </main>
  );
}
