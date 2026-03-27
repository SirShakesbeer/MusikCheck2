import type { GameModeConfig, GameModePresetState } from '../types';

export const LOCAL_STAGE_DURATIONS_DEFAULT = [2, 5, 8];
export const LOCAL_STAGE_POINTS = [3, 2, 1];
export const LOCAL_BOTH_BONUS_POINTS = 1;
export const LOCAL_WRONG_GUESS_PENALTY = 1;
export const LOCAL_REQUIRED_POINTS_TO_WIN = 15;

export const ROUND_TYPES_REQUIRING_PHONES = new Set(['lyrics']);

export type ModeFormValues = {
  audioEnabled: boolean;
  videoEnabled: boolean;
  lyricsEnabled: boolean;
  audioEverySongs: string;
  videoEverySongs: string;
  lyricsEverySongs: string;
  releaseYearFrom: string;
  releaseYearTo: string;
  language: string;
  snippet1Duration: string;
  snippet2Duration: string;
  snippet3Duration: string;
  snippet1Points: string;
  snippet2Points: string;
  snippet3Points: string;
  bothBonusPoints: string;
  wrongGuessPenalty: string;
  requiredPointsToWin: string;
};

export function getDefaultModeFormValues(): ModeFormValues {
  return {
    audioEnabled: true,
    videoEnabled: true,
    lyricsEnabled: true,
    audioEverySongs: '1',
    videoEverySongs: '5',
    lyricsEverySongs: '10',
    releaseYearFrom: '',
    releaseYearTo: '',
    language: '',
    snippet1Duration: String(LOCAL_STAGE_DURATIONS_DEFAULT[0]),
    snippet2Duration: String(LOCAL_STAGE_DURATIONS_DEFAULT[1]),
    snippet3Duration: String(LOCAL_STAGE_DURATIONS_DEFAULT[2]),
    snippet1Points: String(LOCAL_STAGE_POINTS[0]),
    snippet2Points: String(LOCAL_STAGE_POINTS[1]),
    snippet3Points: String(LOCAL_STAGE_POINTS[2]),
    bothBonusPoints: String(LOCAL_BOTH_BONUS_POINTS),
    wrongGuessPenalty: String(LOCAL_WRONG_GUESS_PENALTY),
    requiredPointsToWin: String(LOCAL_REQUIRED_POINTS_TO_WIN),
  };
}

export function buildFormValuesFromPreset(preset: GameModePresetState): ModeFormValues {
  const audioRule = preset.round_rules.find((rule) => rule.kind === 'audio');
  const videoRule = preset.round_rules.find((rule) => rule.kind === 'video');
  const lyricsRule = preset.round_rules.find((rule) => rule.kind === 'lyrics');

  return {
    audioEnabled: Boolean(audioRule),
    videoEnabled: Boolean(videoRule),
    lyricsEnabled: Boolean(lyricsRule),
    audioEverySongs: audioRule ? String(audioRule.every_n_songs) : '0',
    videoEverySongs: videoRule ? String(videoRule.every_n_songs) : '0',
    lyricsEverySongs: lyricsRule ? String(lyricsRule.every_n_songs) : '0',
    releaseYearFrom: typeof preset.filters.release_year_from === 'number' ? String(preset.filters.release_year_from) : '',
    releaseYearTo: typeof preset.filters.release_year_to === 'number' ? String(preset.filters.release_year_to) : '',
    language: preset.filters.language ?? '',
    snippet1Duration: String(preset.stage_durations[0] ?? LOCAL_STAGE_DURATIONS_DEFAULT[0]),
    snippet2Duration: String(preset.stage_durations[1] ?? LOCAL_STAGE_DURATIONS_DEFAULT[1]),
    snippet3Duration: String(preset.stage_durations[2] ?? LOCAL_STAGE_DURATIONS_DEFAULT[2]),
    snippet1Points: String(preset.stage_points[0] ?? LOCAL_STAGE_POINTS[0]),
    snippet2Points: String(preset.stage_points[1] ?? LOCAL_STAGE_POINTS[1]),
    snippet3Points: String(preset.stage_points[2] ?? LOCAL_STAGE_POINTS[2]),
    bothBonusPoints: String(preset.bonus_points_both ?? LOCAL_BOTH_BONUS_POINTS),
    wrongGuessPenalty: String(preset.wrong_guess_penalty ?? LOCAL_WRONG_GUESS_PENALTY),
    requiredPointsToWin: String(preset.required_points_to_win ?? LOCAL_REQUIRED_POINTS_TO_WIN),
  };
}

export function getActiveRoundTypes(values: ModeFormValues): string[] {
  return [
    values.audioEnabled ? 'audio' : null,
    values.videoEnabled ? 'video' : null,
    values.lyricsEnabled ? 'lyrics' : null,
  ].filter(Boolean) as string[];
}

export function getRequiredPhoneRoundTypes(values: ModeFormValues): string[] {
  return getActiveRoundTypes(values).filter((roundType) => ROUND_TYPES_REQUIRING_PHONES.has(roundType));
}

export function getConfiguredStageDurations(values: Pick<ModeFormValues, 'snippet1Duration' | 'snippet2Duration' | 'snippet3Duration'>): number[] {
  const rawValues = [values.snippet1Duration, values.snippet2Duration, values.snippet3Duration].map((value) =>
    Number.parseInt(value, 10),
  );
  return rawValues.map((value, index) =>
    Number.isFinite(value) && value > 0 ? value : LOCAL_STAGE_DURATIONS_DEFAULT[index],
  );
}

export function buildModeConfig(values: ModeFormValues): GameModeConfig {
  const stageDurations = [values.snippet1Duration, values.snippet2Duration, values.snippet3Duration].map((value) =>
    Number.parseInt(value, 10),
  );
  const stagePoints = [values.snippet1Points, values.snippet2Points, values.snippet3Points].map((value) =>
    Number.parseInt(value, 10),
  );
  const rules: { kind: string; every_n_songs: number }[] = [];

  const audioEvery = Number.parseInt(values.audioEverySongs, 10);
  const videoEvery = Number.parseInt(values.videoEverySongs, 10);
  const lyricsEvery = Number.parseInt(values.lyricsEverySongs, 10);

  if (values.audioEnabled && Number.isFinite(audioEvery) && audioEvery > 0) {
    rules.push({ kind: 'audio', every_n_songs: audioEvery });
  }
  if (values.videoEnabled && Number.isFinite(videoEvery) && videoEvery > 0) {
    rules.push({ kind: 'video', every_n_songs: videoEvery });
  }
  if (values.lyricsEnabled && Number.isFinite(lyricsEvery) && lyricsEvery > 0) {
    rules.push({ kind: 'lyrics', every_n_songs: lyricsEvery });
  }

  if (rules.length < 1) {
    throw new Error('Enable at least one round type by setting its frequency to 1 or higher.');
  }

  const fromYear = Number.parseInt(values.releaseYearFrom, 10);
  const toYear = Number.parseInt(values.releaseYearTo, 10);
  const bothBonus = Number.parseInt(values.bothBonusPoints, 10);
  const wrongPenalty = Number.parseInt(values.wrongGuessPenalty, 10);
  const winRequired = Number.parseInt(values.requiredPointsToWin, 10);

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
      language: values.language.trim() || null,
    },
  };
}
