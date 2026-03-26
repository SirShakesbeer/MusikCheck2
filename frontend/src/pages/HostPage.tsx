import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Scoreboard } from '../components/Scoreboard';
import { api } from '../services/api';
import { HtmlAudioSnippetPlayer } from '../services/snippetPlayer';
import { connectLobbySocket } from '../services/ws';
import type { GameModeConfig, GameModePresetState, GameState, RoundState } from '../types';

type SetupStep = 'mode-cards' | 'mode-details' | 'game-setup';

type LocalTeam = {
  id: string;
  name: string;
  score: number;
};

type SourceType = 'youtube-playlist' | 'spotify-playlist' | 'local-folder';

type LocalSource = {
  id: string;
  type: SourceType;
  value: string;
  backendSourceId?: string;
  importedCount?: number;
  ingestError?: string;
};

type LocalSong = {
  title: string;
  artist: string;
  sourceType: 'local' | 'youtube' | 'spotify';
  sourceValue: string;
  snippetUrl: string;
  durationSeconds?: number;
  spotifyTrackId?: string;
};

type TeamRoundGuessState = {
  artistPoints: number;
  titlePoints: number;
  bonusPoints: number;
};

const LOCAL_STAGE_DURATIONS_DEFAULT = [2, 5, 8];
const LOCAL_STAGE_POINTS = [3, 2, 1];
const PLACEHOLDER_SNIPPET_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const LOCAL_BOTH_BONUS_POINTS = 1;
const LOCAL_WRONG_GUESS_PENALTY = 1;
const LOCAL_REQUIRED_POINTS_TO_WIN = 15;
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

const ROUND_TYPES_REQUIRING_PHONES = new Set(['lyrics']);

export function HostPage() {
  const snippetPlayer = useMemo(() => new HtmlAudioSnippetPlayer(), []);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [setupStep, setSetupStep] = useState<SetupStep>('mode-cards');
  const [modeDetailsEditable, setModeDetailsEditable] = useState<boolean>(false);
  const [modeDetailsTitle, setModeDetailsTitle] = useState<string>('');
  const [setupTeams, setSetupTeams] = useState('Team A, Team B');
  const [localSources, setLocalSources] = useState<LocalSource[]>([]);
  const [newSourceType, setNewSourceType] = useState<SourceType>('local-folder');
  const [newSourceValue, setNewSourceValue] = useState('');
  const [pendingLocalFileCount, setPendingLocalFileCount] = useState<number>(0);
  const [localTeams, setLocalTeams] = useState<LocalTeam[]>([]);
  const [localSongs, setLocalSongs] = useState<LocalSong[]>([]);
  const [localStarted, setLocalStarted] = useState(false);
  const [snippetStartOffsets, setSnippetStartOffsets] = useState<number[]>([0, 0, 0]);
  const [localSongIndex, setLocalSongIndex] = useState<number | null>(null);
  const [localRevealed, setLocalRevealed] = useState(false);
  const [lastPlayedStageIndex, setLastPlayedStageIndex] = useState<number>(0);
  const [highestPlayedStageIndex, setHighestPlayedStageIndex] = useState<number>(0);
  const [teamRoundGuessState, setTeamRoundGuessState] = useState<Record<string, TeamRoundGuessState>>({});
  const [localMessage, setLocalMessage] = useState<string | null>(null);

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

  const providerKeyByType: Record<SourceType, string> = {
    'youtube-playlist': 'youtube_playlist',
    'spotify-playlist': 'spotify_playlist',
    'local-folder': 'local_files',
  };

  const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api';

  const localCurrentSong = localSongIndex === null ? null : localSongs[localSongIndex % localSongs.length];
  const localCurrentSource =
    localSongIndex === null || localSources.length === 0 ? null : localSources[localSongIndex % localSources.length];

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

  const ensurePhoneLobby = async () => {
    if (state?.lobby_code) {
      return;
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
  };

  const continueToGameSetup = async () => {
    setSetupStep('game-setup');
    try {
      await ensurePhoneLobby();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

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
      if (runtimeTestMode) {
        setLocalSongs(MOCK_LOCAL_SONGS);
      } else {
        if (localSources.length < 1) {
          throw new Error('Please add at least one source before starting in non-test mode.');
        }

        const sourceIds = localSources.map((source) => source.backendSourceId).filter(Boolean) as string[];
        const result = await api.getIndexedTracks(sourceIds);
        const dynamicSongs: LocalSong[] = result.data.tracks.map((track) => ({
          title: track.title,
          artist: track.artist,
          sourceType:
            track.provider_key === 'youtube_playlist'
              ? 'youtube'
              : track.provider_key === 'spotify_playlist'
                ? 'spotify'
                : 'local',
          sourceValue: track.source_value,
          snippetUrl: track.playback_url.startsWith('http') ? track.playback_url : `${apiBase}${track.playback_url}`,
          durationSeconds: typeof track.duration_seconds === 'number' ? track.duration_seconds : undefined,
          spotifyTrackId: track.provider_key === 'spotify_playlist' ? track.file_path : undefined,
        }));

        if (dynamicSongs.length < 1) {
          throw new Error('No indexed tracks found. Add a source and sync/index before starting.');
        }

        setLocalSongs(dynamicSongs);
      }

      setLocalTeams(names.map((name, index) => ({ id: `local-${index + 1}`, name, score: 0 })));
      setLocalStarted(true);
      setLocalSongIndex(null);
      setLocalRevealed(false);
      setLastPlayedStageIndex(0);
      setHighestPlayedStageIndex(0);
      setTeamRoundGuessState({});
      setError(null);
      setLocalMessage('Local game started. Click Next Song to begin a round.');
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

  const updateLocalScore = (teamId: string, delta: number, reason: string) => {
    let updatedTeamName: string | null = null;
    let updatedScore = 0;
    let winnerName: string | null = null;
    const winTarget = Number.parseInt(requiredPointsToWin, 10);

    setLocalTeams((previous) =>
      previous.map((team) => {
        if (team.id !== teamId) {
          return team;
        }

        const nextScore = Math.max(0, team.score + delta);
        updatedTeamName = team.name;
        updatedScore = nextScore;
        if (Number.isFinite(winTarget) && winTarget > 0 && nextScore >= winTarget && team.score < winTarget) {
          winnerName = team.name;
        }
        return { ...team, score: nextScore };
      }),
    );

    if (updatedTeamName) {
      const direction = delta >= 0 ? '+' : '';
      const winMessage = winnerName ? ` ${winnerName} reached ${winTarget} points and wins!` : '';
      setLocalMessage(`${updatedTeamName}: ${reason} (${direction}${delta}) → ${updatedScore} pts.${winMessage}`);
    }
  };

  const getActiveSnippetPoints = (): number => {
    const points = [snippet1Points, snippet2Points, snippet3Points].map((value) => Number.parseInt(value, 10));
    const index = Math.max(0, Math.min(points.length - 1, highestPlayedStageIndex));
    const selected = points[index];
    return Number.isFinite(selected) ? selected : LOCAL_STAGE_POINTS[index];
  };

  const toggleTeamFact = (teamId: string, fact: 'artist' | 'title') => {
    if (!localCurrentSong) {
      setLocalMessage('No active song. Click Next Song first.');
      return;
    }

    const factPoints = getActiveSnippetPoints();
    const bothBonus = Math.max(0, Number.parseInt(bothBonusPoints, 10) || 0);

    setTeamRoundGuessState((previous) => {
      const current = previous[teamId] ?? { artistPoints: 0, titlePoints: 0, bonusPoints: 0 };
      const next = { ...current };

      const factKey = fact === 'artist' ? 'artistPoints' : 'titlePoints';
      const otherFactKey = fact === 'artist' ? 'titlePoints' : 'artistPoints';
      const wasSelected = current[factKey] > 0;

      let delta = 0;
      let reason = '';

      if (wasSelected) {
        delta -= current[factKey];
        next[factKey] = 0;
        reason = `${fact === 'artist' ? 'Artist' : 'Title'} deselected`;

        if (current.bonusPoints > 0) {
          delta -= current.bonusPoints;
          next.bonusPoints = 0;
          reason = `${reason} (-both bonus)`;
        }
      } else {
        next[factKey] = factPoints;
        delta += factPoints;
        reason = `${fact === 'artist' ? 'Artist' : 'Title'} selected`;

        if (next[otherFactKey] > 0 && current.bonusPoints < 1 && bothBonus > 0) {
          next.bonusPoints = bothBonus;
          delta += bothBonus;
          reason = `${reason} + both bonus`;
        }
      }

      if (delta === 0) {
        return previous;
      }

      updateLocalScore(teamId, delta, reason);
      return { ...previous, [teamId]: next };
    });
  };

  const applyWrongGuessPenalty = (teamId: string) => {
    const penalty = Math.max(0, Number.parseInt(wrongGuessPenalty, 10) || 0);
    if (penalty < 1) {
      setLocalMessage('Wrong-guess penalty is set to 0.');
      return;
    }
    updateLocalScore(teamId, -penalty, 'Wrong guess');
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
      const stageDurations = getConfiguredStageDurations();
      const snippetDuration = stageDurations[stageIndex] ?? LOCAL_STAGE_DURATIONS_DEFAULT[stageIndex];

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

    if (localSongs.length < 1) {
      setLocalMessage('No songs available. Add and sync sources first.');
      return;
    }

    const begin = async () => {
      const nextIndex = localSongIndex === null ? 0 : (localSongIndex + 1) % localSongs.length;
      const nextSong = localSongs[nextIndex];
      const songDuration = await resolveSongDuration(nextSong);
      const stageDurations = getConfiguredStageDurations();
      const starts = stageDurations.map((stageDuration) => {
        const maxStart = Math.max(0, songDuration - stageDuration);
        if (maxStart <= 0) {
          return 0;
        }
        return Math.floor(Math.random() * (maxStart + 1));
      });

      setSnippetStartOffsets(starts);
      setLocalSongIndex(nextIndex);
      setLocalRevealed(false);
      setLastPlayedStageIndex(0);
      setHighestPlayedStageIndex(0);
      setTeamRoundGuessState({});
      setLocalMessage('New song round started.');
    };

    void begin().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  const resolveSongDuration = async (song: LocalSong): Promise<number> => {
    if (song.durationSeconds && song.durationSeconds > 0) {
      return Math.floor(song.durationSeconds);
    }

    if (song.sourceType === 'youtube') {
      return 120;
    }

    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = song.snippetUrl;

    const duration = await new Promise<number>((resolve) => {
      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
      };

      audio.onloadedmetadata = () => {
        const value = Number.isFinite(audio.duration) ? audio.duration : 0;
        cleanup();
        resolve(Math.max(0, Math.floor(value)));
      };

      audio.onerror = () => {
        cleanup();
        resolve(0);
      };
    });

    return duration;
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

    setSetupStep('mode-cards');
    setModeDetailsEditable(false);
    setModeDetailsTitle('');
    setState(null);
    setLocalSources([]);
    setLocalSongs([]);
    setLocalTeams([]);
    setLocalStarted(false);
    setLocalSongIndex(null);
    setLocalRevealed(false);
    setLastPlayedStageIndex(0);
    setHighestPlayedStageIndex(0);
    setTeamRoundGuessState({});
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
    ? {
        round_kind: 'audio',
        song_number: (localSongIndex ?? 0) + 1,
        stage_index: highestPlayedStageIndex,
        stage_duration_seconds:
          getConfiguredStageDurations()[highestPlayedStageIndex] ?? LOCAL_STAGE_DURATIONS_DEFAULT[highestPlayedStageIndex],
        points_available: getActiveSnippetPoints(),
        snippet_url: localCurrentSong.snippetUrl,
        can_guess: false,
        status: 'playing',
      }
    : null;

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
        <section className="single-tv-screen">
          <p>Mode: Single TV</p>

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

          <Scoreboard teams={localTeams} />
          <section>
            <h3>Teams</h3>
            {localTeams.map((team) => (
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
