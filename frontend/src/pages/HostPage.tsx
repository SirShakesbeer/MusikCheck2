import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Scoreboard } from '../components/Scoreboard';
import { api } from '../services/api';
import {
  LOCAL_BOTH_BONUS_POINTS,
  LOCAL_REQUIRED_POINTS_TO_WIN,
  LOCAL_STAGE_DURATIONS_DEFAULT,
  LOCAL_STAGE_POINTS,
  LOCAL_WRONG_GUESS_PENALTY,
  buildFormValuesFromPreset,
  getConfiguredStageDurations,
  getDefaultModeFormValues,
  getRequiredPhoneRoundTypes,
  type ModeFormValues,
} from '../services/gameModeFormService';
import {
  continueToGameSetup as continueToGameSetupFlow,
  ensurePhoneLobby as ensurePhoneLobbyFlow,
  openCustomCard as openCustomCardFlow,
  openPresetCard as openPresetCardFlow,
  saveCurrentPreset as saveCurrentPresetFlow,
} from '../services/hostSetupController';
import {
  buildSongsForLocalGame,
  buildTeams,
  getActiveSnippetPoints as getActiveSnippetPointsFlow,
  type LocalSong,
} from '../services/localRoundController';
import {
  addSource,
  cleanupBackendSources,
  extractFolderSelection,
  pickLocalFolderName,
  type LocalSource,
  type SourceType,
} from '../services/mediaSourceController';
import { HtmlAudioSnippetPlayer } from '../services/snippetPlayer';
import { useHostSetupStore } from '../stores/hostSetupStore';
import { connectLobbySocket } from '../services/ws';
import type { GameModePresetState, GameState, RoundState, RoundTeamState } from '../types';

const PLACEHOLDER_SNIPPET_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const MOCK_LOCAL_SONGS: LocalSong[] = [
  {
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    sourceType: 'local',
    sourceValue: 'C:/Music/Party/NeverGonnaGiveYouUp.mp3',
    snippetUrl: PLACEHOLDER_SNIPPET_URL,
  },
  {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    sourceType: 'youtube',
    sourceValue: 'YouTube',
    snippetUrl: PLACEHOLDER_SNIPPET_URL,
  },
  {
    title: 'Take On Me',
    artist: 'a-ha',
    sourceType: 'spotify',
    sourceValue: 'Spotify',
    snippetUrl: PLACEHOLDER_SNIPPET_URL,
  },
];

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'youtube-playlist', label: 'YouTube Playlist Link' },
  { value: 'spotify-playlist', label: 'Spotify Playlist Link' },
  { value: 'local-folder', label: 'Local Folder' },
];

export function HostPage() {
  const snippetPlayer = useMemo(() => new HtmlAudioSnippetPlayer(), []);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const {
    setupStep,
    modeDetailsEditable,
    modeDetailsTitle,
    setSetupStep,
    setModeDetailsEditable,
    setModeDetailsTitle,
    resetSetup,
  } = useHostSetupStore();
  const [setupTeams, setSetupTeams] = useState('Team A, Team B');
  const [localSources, setLocalSources] = useState<LocalSource[]>([]);
  const [newSourceType, setNewSourceType] = useState<SourceType>('local-folder');
  const [newSourceValue, setNewSourceValue] = useState('');
  const [pendingLocalFileCount, setPendingLocalFileCount] = useState<number>(0);
  const [localSongs, setLocalSongs] = useState<LocalSong[]>([]);
  const [localStarted, setLocalStarted] = useState(false);
  const [snippetStartOffsets, setSnippetStartOffsets] = useState<number[]>([0, 0, 0]);
  const [localSongIndex, setLocalSongIndex] = useState<number | null>(null);
  const [localRevealed, setLocalRevealed] = useState(false);
  const [lastPlayedStageIndex, setLastPlayedStageIndex] = useState<number>(0);
  const [highestPlayedStageIndex, setHighestPlayedStageIndex] = useState<number>(0);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const [hostName, setHostName] = useState('Host');
  const [gameModes, setGameModes] = useState<GameModePresetState[]>([]);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('classic_audio');
  const defaultModeFormValues = getDefaultModeFormValues();
  const [audioEverySongs, setAudioEverySongs] = useState<string>(defaultModeFormValues.audioEverySongs);
  const [videoEverySongs, setVideoEverySongs] = useState<string>(defaultModeFormValues.videoEverySongs);
  const [lyricsEverySongs, setLyricsEverySongs] = useState<string>(defaultModeFormValues.lyricsEverySongs);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(defaultModeFormValues.audioEnabled);
  const [videoEnabled, setVideoEnabled] = useState<boolean>(defaultModeFormValues.videoEnabled);
  const [lyricsEnabled, setLyricsEnabled] = useState<boolean>(defaultModeFormValues.lyricsEnabled);
  const [releaseYearFrom, setReleaseYearFrom] = useState<string>(defaultModeFormValues.releaseYearFrom);
  const [releaseYearTo, setReleaseYearTo] = useState<string>(defaultModeFormValues.releaseYearTo);
  const [language, setLanguage] = useState<string>(defaultModeFormValues.language);
  const [snippet1Duration, setSnippet1Duration] = useState<string>(defaultModeFormValues.snippet1Duration);
  const [snippet2Duration, setSnippet2Duration] = useState<string>(defaultModeFormValues.snippet2Duration);
  const [snippet3Duration, setSnippet3Duration] = useState<string>(defaultModeFormValues.snippet3Duration);
  const [snippet1Points, setSnippet1Points] = useState<string>(defaultModeFormValues.snippet1Points);
  const [snippet2Points, setSnippet2Points] = useState<string>(defaultModeFormValues.snippet2Points);
  const [snippet3Points, setSnippet3Points] = useState<string>(defaultModeFormValues.snippet3Points);
  const [bothBonusPoints, setBothBonusPoints] = useState<string>(defaultModeFormValues.bothBonusPoints);
  const [wrongGuessPenalty, setWrongGuessPenalty] = useState<string>(defaultModeFormValues.wrongGuessPenalty);
  const [requiredPointsToWin, setRequiredPointsToWin] = useState<string>(defaultModeFormValues.requiredPointsToWin);
  const [saveAsPreset, setSaveAsPreset] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [state, setState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtimeTestMode, setRuntimeTestMode] = useState<boolean>(false);
  const [youtubeApiConfigured, setYoutubeApiConfigured] = useState<boolean>(false);
  const [runtimeConfigBusy, setRuntimeConfigBusy] = useState<boolean>(false);
  const [playerPopup, setPlayerPopup] = useState<Window | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyAuthBusy, setSpotifyAuthBusy] = useState<boolean>(false);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const spotifyDeviceIdRef = useRef<string | null>(null);
  const spotifyPlayerRef = useRef<any>(null);
  const spotifyPlaybackTimer = useRef<number | null>(null);

  const stopAllPlayback = () => {
    // Stop HTML audio/YouTube playback
    snippetPlayer.stop();
    
    // Stop Spotify playback
    if (spotifyPlaybackTimer.current !== null) {
      window.clearTimeout(spotifyPlaybackTimer.current);
      spotifyPlaybackTimer.current = null;
    }
    if (spotifyPlayerRef.current) {
      void spotifyPlayerRef.current.pause();
    }
  };

  const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api';

  const localCurrentSong = localSongIndex === null ? null : localSongs[localSongIndex % localSongs.length];
  const localCurrentSource =
    localSongIndex === null || localSources.length === 0 ? null : localSources[localSongIndex % localSources.length];

  const modeFormValues: ModeFormValues = {
    audioEnabled,
    videoEnabled,
    lyricsEnabled,
    audioEverySongs,
    videoEverySongs,
    lyricsEverySongs,
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
  };

  const applyPresetToForm = (preset: GameModePresetState) => {
    const nextValues = buildFormValuesFromPreset(preset);
    setAudioEnabled(nextValues.audioEnabled);
    setVideoEnabled(nextValues.videoEnabled);
    setLyricsEnabled(nextValues.lyricsEnabled);
    setAudioEverySongs(nextValues.audioEverySongs);
    setVideoEverySongs(nextValues.videoEverySongs);
    setLyricsEverySongs(nextValues.lyricsEverySongs);
    setReleaseYearFrom(nextValues.releaseYearFrom);
    setReleaseYearTo(nextValues.releaseYearTo);
    setLanguage(nextValues.language);
    setSnippet1Duration(nextValues.snippet1Duration);
    setSnippet2Duration(nextValues.snippet2Duration);
    setSnippet3Duration(nextValues.snippet3Duration);
    setSnippet1Points(nextValues.snippet1Points);
    setSnippet2Points(nextValues.snippet2Points);
    setSnippet3Points(nextValues.snippet3Points);
    setBothBonusPoints(nextValues.bothBonusPoints);
    setWrongGuessPenalty(nextValues.wrongGuessPenalty);
    setRequiredPointsToWin(nextValues.requiredPointsToWin);
  };

  const requiredPhoneRoundTypes = getRequiredPhoneRoundTypes(modeFormValues);
  const modeRequiresPhoneConnections = requiredPhoneRoundTypes.length > 0;

  const openPresetCard = (preset: GameModePresetState) => {
    const next = openPresetCardFlow({ preset });
    setSelectedPresetKey(next.selectedPresetKey);
    setModeDetailsEditable(next.modeDetailsEditable);
    setModeDetailsTitle(next.modeDetailsTitle);
    applyPresetToForm(preset);
    setSetupStep(next.setupStep);
    setError(null);
  };

  const openCustomCard = () => {
    const next = openCustomCardFlow({
      gameModes,
      selectedPresetKey,
    });
    const basePreset = next.basePreset;
    if (basePreset) {
      applyPresetToForm(basePreset);
      setSelectedPresetKey(basePreset.key);
    }
    setModeDetailsEditable(next.modeDetailsEditable);
    setModeDetailsTitle(next.modeDetailsTitle);
    setSetupStep(next.setupStep);
    setError(null);
  };

  const ensurePhoneLobby = async () => {
    const nextState = await ensurePhoneLobbyFlow({
      state,
      hostName,
      selectedPresetKey,
      modeDetailsTitle,
      modeFormValues,
    });
    setState(nextState);
  };

  const continueToGameSetup = async () => {
    try {
      const next = await continueToGameSetupFlow({
        state,
        hostName,
        selectedPresetKey,
        modeDetailsTitle,
        modeFormValues,
      });
      setSetupStep(next.setupStep);
      setState(next.state);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

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
          applyPresetToForm(defaultPreset);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void loadRuntimeConfig();
  }, []);

  const saveCurrentPreset = async () => {
    try {
      const next = await saveCurrentPresetFlow({
        presetName: newPresetName,
        modeFormValues,
        gameModes,
      });
      setGameModes(next.gameModes);
      setSelectedPresetKey(next.selectedPresetKey);
      applyPresetToForm(next.savedPreset);
      setSaveAsPreset(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startLocalGame = () => {
    if (modeRequiresPhoneConnections && (state?.players.length ?? 0) < 1) {
      setError('This game mode requires phones. At least one phone must be connected before starting.');
      return;
    }

    const begin = async () => {
      const songs = await buildSongsForLocalGame({
        runtimeTestMode,
        localSources,
        mockSongs: MOCK_LOCAL_SONGS,
        apiBase,
      });
      const requestedTeams = buildTeams(setupTeams);
      const ensuredState = await ensurePhoneLobbyFlow({
        state,
        hostName,
        selectedPresetKey,
        modeDetailsTitle,
        modeFormValues,
      });

      if (!ensuredState?.lobby_code) {
        throw new Error('Could not create a lobby for authoritative scoring.');
      }

      let latestState = ensuredState;
      const existingTeamNames = new Set(latestState.teams.map((team) => team.name.trim().toLowerCase()));
      for (const [index, team] of requestedTeams.entries()) {
        const normalizedName = team.name.trim().toLowerCase();
        if (existingTeamNames.has(normalizedName)) {
          continue;
        }
        const joinResult = await api.joinLobby(
          latestState.lobby_code,
          `Host Team ${index + 1}`,
          team.name,
        );
        latestState = joinResult.data;
        existingTeamNames.add(normalizedName);
      }

      setLocalSongs(songs);
      setState(latestState);
      
      // Register media with backend for orchestration
      const mediaForBackend = songs.map((song) => ({
        title: song.title,
        artist: song.artist,
        source_id: song.sourceValue,
        source_type: song.sourceType,
        source_value: song.sourceValue,
        snippet_url: song.snippetUrl,
        duration_seconds: song.durationSeconds,
        spotify_track_id: song.spotifyTrackId,
      }));
      await api.setupLocalMedia(latestState.lobby_code, mediaForBackend);
      
      setLocalStarted(true);
      setLocalSongIndex(null);
      setLocalRevealed(false);
      setLastPlayedStageIndex(0);
      setHighestPlayedStageIndex(0);
      setError(null);
      setLocalMessage('Local game started. Click Next Song to begin a round.');
    };

    void begin().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  const addLocalSource = async () => {
    try {
      const source = await addSource({
        sourceType: newSourceType,
        sourceValue: newSourceValue,
        pendingLocalFileCount,
      });
      setLocalSources((previous) => [
        ...previous,
        source,
      ]);
      setNewSourceValue('');
      setPendingLocalFileCount(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const updateLocalSource = (sourceId: string, patch: Partial<Pick<LocalSource, 'type' | 'value'>>) => {
    setLocalSources((previous) => previous.map((source) => (source.id === sourceId ? { ...source, ...patch } : source)));
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

  const getActiveSnippetPoints = (): number => {
    return getActiveSnippetPointsFlow({
      snippet1Points,
      snippet2Points,
      snippet3Points,
      highestPlayedStageIndex,
      fallbackPoints: LOCAL_STAGE_POINTS,
    });
  };

  const toggleTeamFact = async (teamId: string, fact: 'artist' | 'title') => {
    if (!localCurrentSong) {
      setLocalMessage('No active song. Click Next Song first.');
      return;
    }

    const lobbyCode = stateRef.current?.lobby_code;
    if (!lobbyCode) {
      setError('Lobby code is missing. Restart setup to continue.');
      return;
    }

    try {
      const result = await api.toggleRoundFact(lobbyCode, teamId, fact);
      setState(result.data);
      setLocalMessage(result.data.message ?? `Toggled ${fact}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyWrongGuessPenalty = async (teamId: string) => {
    if (!localCurrentSong) {
      setLocalMessage('No active song. Click Next Song first.');
      return;
    }

    const lobbyCode = stateRef.current?.lobby_code;
    if (!lobbyCode) {
      setError('Lobby code is missing. Restart setup to continue.');
      return;
    }

    try {
      const result = await api.applyWrongGuessPenalty(lobbyCode, teamId);
      setState(result.data);
      setLocalMessage(result.data.message ?? 'Wrong-guess penalty applied.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const ensureBackendRoundStage = async (targetStageIndex: number) => {
    if (targetStageIndex < 1) {
      return;
    }

    const lobbyCode = stateRef.current?.lobby_code;
    if (!lobbyCode) {
      return;
    }

    let currentStage = stateRef.current?.current_round?.stage_index ?? 0;
    while (currentStage < targetStageIndex) {
      const result = await api.nextStage(lobbyCode);
      const nextState = result.data;
      setState(nextState);
      const nextStage = nextState.current_round?.stage_index;
      if (typeof nextStage !== 'number' || nextStage <= currentStage) {
        break;
      }
      currentStage = nextStage;
    }
  };

  const playLocalSnippet = async (stageIndex: number) => {
    try {
      // Stop any currently playing audio
      stopAllPlayback();

      if (!localCurrentSong) {
        setLocalMessage('Click Next Song first.');
        return;
      }

      const startAtSeconds = snippetStartOffsets[stageIndex] ?? 0;
      const stageDurations = getConfiguredStageDurations(modeFormValues);
      const snippetDuration = stageDurations[stageIndex] ?? LOCAL_STAGE_DURATIONS_DEFAULT[stageIndex];
      await ensureBackendRoundStage(stageIndex);

      if (localCurrentSong.sourceType === 'spotify') {
        if (!localCurrentSong.spotifyTrackId) {
          setError('Spotify track id is missing for this song.');
          return;
        }
        if (!spotifyConnected) {
          setError('Connect Spotify first to play Spotify snippets.');
          return;
        }

        const trackDurationSeconds = Math.max(1, Math.floor(localCurrentSong.durationSeconds ?? 180));
        const targetDeviceId = await ensureSpotifyBrowserDevice();
        if (!targetDeviceId) {
          setError('Spotify browser device not detected. Close any other Spotify tabs/apps, keep this page open, and try again.');
          return;
        }

        console.log('[Spotify] Activating device:', targetDeviceId);
        await api.activateSpotifyDevice(targetDeviceId);
        
        try {
          console.log('[Spotify] Playing track with device:', targetDeviceId);
          await api.playSpotifyRandom(
            localCurrentSong.spotifyTrackId,
            trackDurationSeconds,
            snippetDuration,
            targetDeviceId,
            startAtSeconds,
          );
          
          // Set timer to stop playback after snippet duration
          spotifyPlaybackTimer.current = window.setTimeout(
            () => {
              spotifyPlayerRef.current?.pause();
              spotifyPlaybackTimer.current = null;
            },
            snippetDuration * 1000,
          );
        } catch (firstErr) {
          const message = firstErr instanceof Error ? firstErr.message : String(firstErr);
          console.error('[Spotify] Play failed:', message);
          if (!message.toLowerCase().includes('device')) {
            throw firstErr;
          }

          console.log('[Spotify] Device unavailable, clearing cache and retrying...');
          spotifyDeviceIdRef.current = null;
          setSpotifyDeviceId(null);
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
          
          const retryDeviceId = await ensureSpotifyBrowserDevice();
          if (!retryDeviceId) {
            throw new Error('Spotify browser device still not available. Close other Spotify tabs and ensure Premium is active.');
          }
          console.log('[Spotify] Retry with device:', retryDeviceId);
          await api.activateSpotifyDevice(retryDeviceId);
          await api.playSpotifyRandom(
            localCurrentSong.spotifyTrackId,
            trackDurationSeconds,
            snippetDuration,
            retryDeviceId,
            startAtSeconds,
          );
          
          // Set timer to stop playback after snippet duration
          spotifyPlaybackTimer.current = window.setTimeout(
            () => {
              spotifyPlayerRef.current?.pause();
              spotifyPlaybackTimer.current = null;
            },
            snippetDuration * 1000,
          );
        }
        setLastPlayedStageIndex(stageIndex);
        setHighestPlayedStageIndex((previous) => Math.max(previous, stageIndex));
        setLocalMessage(
          `Triggered Spotify snippet ${stageIndex + 1} (${snippetDuration}s) from ${Math.floor(startAtSeconds)}s.`,
        );
        return;
      }

      await snippetPlayer.play({
        snippetUrl: localCurrentSong.snippetUrl,
        durationSeconds: snippetDuration,
        startAtSeconds,
      });

      setLastPlayedStageIndex(stageIndex);
      setHighestPlayedStageIndex((previous) => Math.max(previous, stageIndex));
      setLocalMessage(
        `Playing snippet ${stageIndex + 1} (${snippetDuration}s) from ${Math.floor(startAtSeconds)}s.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const revealLocalSong = () => {
    if (!localCurrentSong) {
      setLocalMessage('No active song to reveal.');
      return;
    }
    setLocalRevealed(true);
  };

  const nextLocalSong = () => {
    // Stop any currently playing audio before starting new round
    stopAllPlayback();

    const begin = async () => {
      const lobbyCode = stateRef.current?.lobby_code;
      if (!lobbyCode) {
        setError('Lobby code is missing. Restart setup to continue.');
        return;
      }

      const result = await api.nextLocalSong(lobbyCode);
      const roundData = result.data;

      setState(roundData.state);
      setSnippetStartOffsets(roundData.snippet_start_offsets);
      setLocalRevealed(false);
      setLastPlayedStageIndex(0);
      setHighestPlayedStageIndex(0);
      setLocalMessage(roundData.message || 'New song round started.');
      
      // Update local song tracking based on backend song number
      if (roundData.state?.current_round?.song_number) {
        setLocalSongIndex((roundData.state.current_round.song_number - 1) % localSongs.length);
      }
    };

    void begin().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  const getSourceInfo = (song: LocalSong, source: LocalSource | null) => {
    if (source) {
      if (source.type === 'local-folder') {
        return `Local folder: ${source.value}`;
      }
      if (source.type === 'youtube-playlist') {
        return 'YouTube';
      }
      return 'Spotify';
    }

    if (song.sourceType === 'local') {
      return `Local file: ${song.sourceValue}`;
    }
    if (song.sourceType === 'youtube') {
      return 'YouTube';
    }
    return 'Spotify';
  };

  const resetToMenu = () => {
    const sourceIdsToCleanup = localSources
      .map((source) => source.backendSourceId)
      .filter(Boolean) as string[];
    void cleanupBackendSources(sourceIdsToCleanup).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });

    resetSetup();
    setState(null);
    setLocalSources([]);
    setLocalSongs([]);
    setLocalStarted(false);
    setLocalSongIndex(null);
    setLocalRevealed(false);
    setLastPlayedStageIndex(0);
    setHighestPlayedStageIndex(0);
    setLocalMessage(null);
    setError(null);
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
            void initializeSpotifyWebPlayer();
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

  const getYoutubeWatchUrl = (embedUrl: string): string =>
    embedUrl.replace('/embed/', '/watch?v=').replace('?autoplay=1', '').replace('&autoplay=1', '');

  const openPlayerPopup = () => {
    if (!localCurrentSong) {
      return;
    }

    const popup = window.open('', 'musikcheck-player', 'width=520,height=340,resizable=yes');
    if (!popup) {
      setError('Popup was blocked by the browser. Please allow popups for this site.');
      return;
    }

    const title = `${localCurrentSong.artist} — ${localCurrentSong.title}`;
    const body =
      localCurrentSong.sourceType === 'youtube'
        ? `<iframe width="100%" height="220" src="${localCurrentSong.snippetUrl.replace('autoplay=1', 'autoplay=0')}" title="Revealed song player" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
        : localCurrentSong.sourceType === 'spotify'
          ? `<p><a href="${localCurrentSong.snippetUrl}" target="_blank" rel="noreferrer">Open this track in Spotify</a></p>`
        : `<audio controls autoplay src="${localCurrentSong.snippetUrl}" style="width:100%"></audio>`;
    const extra =
      localCurrentSong.sourceType === 'youtube'
        ? `<p style="margin-top:8px;"><a href="${getYoutubeWatchUrl(localCurrentSong.snippetUrl)}" target="_blank" rel="noreferrer">Open on YouTube</a></p>`
        : '';

    popup.document.title = `MusikCheck Player`;
    popup.document.body.innerHTML = `
      <main style="font-family: Arial, sans-serif; padding: 12px; background: #fff;">
        <h3 style="margin-top: 0;">${title}</h3>
        ${body}
        ${extra}
      </main>
    `;
    popup.focus();
    setPlayerPopup(popup);
  };

  useEffect(() => {
    if (spotifyConnected) {
      void initializeSpotifyWebPlayer();
    }
  }, [spotifyConnected]);

  const initializeSpotifyWebPlayer = async (forceRecreate = false) => {
    if (forceRecreate && spotifyPlayerRef.current) {
      try {
        spotifyPlayerRef.current.disconnect();
      } catch {
      }
      spotifyPlayerRef.current = null;
      spotifyDeviceIdRef.current = null;
      setSpotifyDeviceId(null);
    }

    if (spotifyPlayerRef.current) {
      return;
    }

    const loadSdk = () =>
      new Promise<void>((resolve) => {
        const existing = document.querySelector('script[data-spotify-sdk="true"]');
        if (existing) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        script.setAttribute('data-spotify-sdk', 'true');
        script.onload = () => resolve();
        document.body.appendChild(script);
      });

    await loadSdk();

    const windowWithSpotify = window as Window & {
      Spotify?: {
        Player: new (config: {
          name: string;
          getOAuthToken: (callback: (token: string) => void) => void;
          volume?: number;
        }) => {
          addListener: (event: string, callback: (...args: any[]) => void) => void;
          connect: () => Promise<boolean>;
          disconnect: () => void;
          activateElement?: () => Promise<void> | void;
        };
      };
      onSpotifyWebPlaybackSDKReady?: () => void;
    };

    const createPlayer = async () => {
      if (!windowWithSpotify.Spotify) {
        return;
      }
      const player = new windowWithSpotify.Spotify.Player({
        name: 'MusikCheck2 Browser Player',
        getOAuthToken: async (callback: (token: string) => void) => {
          const token = await api.getSpotifyAccessToken();
          callback(token.data.access_token);
        },
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        spotifyDeviceIdRef.current = device_id;
        setSpotifyDeviceId(device_id);
        console.log('[Spotify SDK] Device ready:', device_id);
      });
      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        if (spotifyDeviceIdRef.current === device_id) {
          spotifyDeviceIdRef.current = null;
          setSpotifyDeviceId(null);
        }
      });
      player.addListener('initialization_error', ({ message }: { message: string }) => setError(message));
      player.addListener('authentication_error', ({ message }: { message: string }) => setError(message));
      player.addListener('account_error', ({ message }: { message: string }) => setError(message));

      const connected = await player.connect();
      if (!connected) {
        throw new Error('Spotify SDK player could not connect. Keep this tab open and try again.');
      }

      spotifyPlayerRef.current = player;
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    };

    if (windowWithSpotify.Spotify) {
      await createPlayer();
      return;
    }

    await new Promise<void>((resolve) => {
      windowWithSpotify.onSpotifyWebPlaybackSDKReady = () => {
        void createPlayer().finally(() => resolve());
      };
    });
  };

  const ensureSpotifyBrowserDevice = async (): Promise<string | null> => {
    await initializeSpotifyWebPlayer();

    const player = spotifyPlayerRef.current as
      | { activateElement?: () => Promise<void> | void; connect?: () => Promise<boolean> }
      | null;
    if (player?.connect && !spotifyDeviceIdRef.current) {
      console.log('[Spotify SDK] Connecting player...');
      await player.connect();
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
    if (player?.activateElement) {
      console.log('[Spotify SDK] Activating element...');
      await player.activateElement();
    }

    if (spotifyDeviceIdRef.current) {
      console.log('[Spotify SDK] Using cached device:', spotifyDeviceIdRef.current);
      return spotifyDeviceIdRef.current;
    }

    const timeoutMs = 8000;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      if (spotifyDeviceIdRef.current) {
        console.log('[Spotify SDK] Device ready after wait:', spotifyDeviceIdRef.current);
        return spotifyDeviceIdRef.current;
      }
    }

    console.warn('[Spotify SDK] First device wait timed out, recreating player...');
    await initializeSpotifyWebPlayer(true);

    const recreatedPlayer = spotifyPlayerRef.current as
      | { activateElement?: () => Promise<void> | void; connect?: () => Promise<boolean> }
      | null;
    if (recreatedPlayer?.activateElement) {
      console.log('[Spotify SDK] Activating element after recreate...');
      await recreatedPlayer.activateElement();
    }

    const retryStartedAt = Date.now();
    while (Date.now() - retryStartedAt < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      if (spotifyDeviceIdRef.current) {
        console.log('[Spotify SDK] Device ready after recreate:', spotifyDeviceIdRef.current);
        return spotifyDeviceIdRef.current;
      }
    }

    console.warn('[Spotify SDK] Device ID not available after timeout');
    return null;
  };

  useEffect(() => {
    return () => {
      snippetPlayer.dispose();
      if (spotifyPlayerRef.current) {
        spotifyPlayerRef.current.disconnect();
      }
      if (playerPopup && !playerPopup.closed) {
        playerPopup.close();
      }
    };
  }, [snippetPlayer, playerPopup]);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  const localRoundForPanel: RoundState | null = localCurrentSong
    ? state?.current_round ?? {
        round_kind: 'audio',
        song_number: (localSongIndex ?? 0) + 1,
        stage_index: highestPlayedStageIndex,
        stage_duration_seconds:
          getConfiguredStageDurations(modeFormValues)[highestPlayedStageIndex] ??
          LOCAL_STAGE_DURATIONS_DEFAULT[highestPlayedStageIndex],
        points_available: getActiveSnippetPoints(),
        snippet_url: localCurrentSong.snippetUrl,
        can_guess: false,
        status: 'playing',
      }
    : null;

  const backendRoundTeamStates =
    ((state as (GameState & { round_team_states?: RoundTeamState[] }) | null)?.round_team_states ?? []);

  type TeamRoundAction = {
    artistPoints: number;
    titlePoints: number;
    bonusPoints: number;
  };

  const teamRoundGuessState: Record<string, TeamRoundAction> = Object.fromEntries(
    backendRoundTeamStates.map((teamState: RoundTeamState) => [
      teamState.team_id,
      {
        artistPoints: teamState.artist_points,
        titlePoints: teamState.title_points,
        bonusPoints: teamState.bonus_points,
      },
    ]),
  );

  return (
    <main>
      <h1>MusikCheck2 Host</h1>

      {!localStarted && setupStep === 'mode-cards' && (
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
          <p>
            Spotify: {spotifyConnected ? 'Connected' : 'Not connected'}
            <button onClick={connectSpotify} disabled={spotifyAuthBusy} style={{ marginLeft: 8 }}>
              {spotifyAuthBusy ? 'Connecting...' : 'Connect Spotify'}
            </button>
          </p>
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

      {!localStarted && setupStep === 'mode-details' && (
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

      {setupStep === 'game-setup' && !localStarted && (
        <section>
          <h3>Game Setup</h3>
          <p>
            Game mode: {modeDetailsTitle || (gameModes.find((preset) => preset.key === selectedPresetKey)?.name ?? selectedPresetKey)}
          </p>
          <p>Gameplay always runs on one host screen.</p>
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

      {localStarted && (
        <section className="host-screen">
          <p>Mode: Host Screen</p>

          <div className="top-controls">
            <button onClick={() => playLocalSnippet(0)} disabled={!localCurrentSong}>
              Snippet 1
            </button>
            <button onClick={() => playLocalSnippet(1)} disabled={!localCurrentSong}>
              Snippet 2
            </button>
            <button onClick={() => playLocalSnippet(2)} disabled={!localCurrentSong}>
              Snippet 3
            </button>
            <div className="spacer" />
            <button onClick={revealLocalSong} disabled={!localCurrentSong}>
              Reveal
            </button>
            <button onClick={nextLocalSong}>Next Song</button>
          </div>

          {localRevealed && localCurrentSong && (
            <>
              <p>
                {localCurrentSong.artist} — {localCurrentSong.title} • {getSourceInfo(localCurrentSong, localCurrentSource)}
              </p>
              <p>
                <button onClick={openPlayerPopup}>Pop out player</button>
              </p>
              {localCurrentSong.sourceType !== 'youtube' ? (
                localCurrentSong.sourceType === 'spotify' ? (
                  <p>
                    Full playback for Spotify opens in Spotify app/web player.
                    <a href={localCurrentSong.snippetUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
                      Open in Spotify
                    </a>
                  </p>
                ) : (
                  <audio controls src={localCurrentSong.snippetUrl} style={{ width: '100%', maxWidth: 560 }} />
                )
              ) : (
                <p>
                  Audio-only full-song playback for YouTube is not available in-browser with playlist metadata links.
                  <a href={getYoutubeWatchUrl(localCurrentSong.snippetUrl)} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
                    Open on YouTube
                  </a>
                </p>
              )}
            </>
          )}

          {localCurrentSong && (
            <p>
              Active stage points: {localRoundForPanel?.points_available ?? getActiveSnippetPoints()} (scoring based on
              snippet {highestPlayedStageIndex + 1}; last played snippet {lastPlayedStageIndex + 1})
            </p>
          )}

          <Scoreboard teams={state?.teams ?? []} />
          <section>
            <h3>Teams</h3>
            {(state?.teams ?? []).map((team) => (
              <div key={team.id} className="team-row">
                <div className="team-label">{team.name}</div>
                <div className="team-lane">
                  <div
                    className="team-box"
                    style={{
                      left: `${
                        Math.max(
                          0,
                          Math.min(1, team.score / Math.max(1, Number.parseInt(requiredPointsToWin, 10) || LOCAL_REQUIRED_POINTS_TO_WIN)),
                        ) * 90
                      }%`,
                    }}
                  >
                    {team.score}
                  </div>
                </div>
                <div className="team-actions">
                  <button
                    onClick={() => toggleTeamFact(team.id, 'artist')}
                    disabled={!localCurrentSong}
                  >
                    Artist {teamRoundGuessState[team.id]?.artistPoints ? '✓' : ''}
                  </button>
                  <button
                    onClick={() => toggleTeamFact(team.id, 'title')}
                    disabled={!localCurrentSong}
                  >
                    Title {teamRoundGuessState[team.id]?.titlePoints ? '✓' : ''}
                  </button>
                  <button onClick={() => applyWrongGuessPenalty(team.id)} disabled={!localCurrentSong}>
                    Wrong (-{Math.max(0, Number.parseInt(wrongGuessPenalty, 10) || 0)})
                  </button>
                </div>
              </div>
            ))}
          </section>
          {localMessage && <p>{localMessage}</p>}

          <div className="bottom-row">
            <button className="quit-button" onClick={resetToMenu}>
              Quit
            </button>
          </div>
        </section>
      )}

      {error && <p>{error}</p>}
    </main>
  );
}
