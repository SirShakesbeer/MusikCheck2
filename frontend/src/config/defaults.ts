export const API_BASE_URL = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api';
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE ?? 'ws://localhost:8000';

export const DEFAULT_HOST_NAME = 'Host';
export const DEFAULT_PRESET_KEY = 'classic_audio';
export const DEFAULT_TEAM_NAMES = ['Team A', 'Team B'] as const;
export const DEFAULT_SETUP_TEAMS_TEXT = DEFAULT_TEAM_NAMES.join(', ');
export const DEFAULT_MODE_DETAILS_TITLE = 'Game Mode Details';

export const DEFAULT_PLAYER_NAME = 'Player';
export const DEFAULT_PLAYER_TEAM_NAME = 'Team A';

export const DEFAULT_SCOREBOARD_MAX_POINTS = 1;
export const DEFAULT_ROUND_STAGE_COUNT = 3;
export const UNKNOWN_REVEAL_VALUE = 'Unknown';

export const MODE_FORM_DEFAULTS = {
  stageDurations: [1, 2, 3] as const,
  stagePoints: [3, 2, 1] as const,
  bonusPointsBoth: 1,
  wrongGuessPenalty: 1,
  requiredPointsToWin: 42,
  audioEverySongs: 1,
  videoEverySongs: 5,
  lyricsEverySongs: 10,
  roundTypesRequiringPhones: ['lyrics'] as const,
};

export const API_RETRY_DEFAULTS = {
  attempts: 3,
  delayMs: 250,
};