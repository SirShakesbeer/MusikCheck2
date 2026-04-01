import type { GameModeConfig, GameModePresetState, RoundTypeDefinition } from '../types';
import { MODE_FORM_DEFAULTS } from '../config/defaults';

export const LOCAL_STAGE_DURATIONS_DEFAULT = [...MODE_FORM_DEFAULTS.stageDurations];
export const LOCAL_STAGE_POINTS = [...MODE_FORM_DEFAULTS.stagePoints];
export const LOCAL_BOTH_BONUS_POINTS = MODE_FORM_DEFAULTS.bonusPointsBoth;
export const LOCAL_WRONG_GUESS_PENALTY = MODE_FORM_DEFAULTS.wrongGuessPenalty;
export const LOCAL_REQUIRED_POINTS_TO_WIN = MODE_FORM_DEFAULTS.requiredPointsToWin;

export const ROUND_TYPES_REQUIRING_PHONES = new Set<string>(MODE_FORM_DEFAULTS.roundTypesRequiringPhones);

export type ModeRoundRuleValues = {
  enabled: boolean;
  every_n_songs: string;
};

export type ModeFormValues = {
  roundRules: Record<string, ModeRoundRuleValues>;
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

function buildRoundRuleValues(
  roundTypes: RoundTypeDefinition[],
  presetRules: GameModePresetState['round_rules'] = [],
): Record<string, ModeRoundRuleValues> {
  const roundRuleValues: Record<string, ModeRoundRuleValues> = {};
  const roundTypesToUse = roundTypes.length > 0 ? roundTypes : presetRules.map((rule) => ({
    kind: rule.kind,
    label: rule.kind,
    requires_phone_connections: ROUND_TYPES_REQUIRING_PHONES.has(rule.kind),
    default_every_n_songs: rule.every_n_songs,
  }));

  for (const roundType of roundTypesToUse) {
    const presetRule = presetRules.find((rule) => rule.kind === roundType.kind);
    roundRuleValues[roundType.kind] = {
      enabled: Boolean(presetRule),
      every_n_songs: String(presetRule?.every_n_songs ?? roundType.default_every_n_songs),
    };
  }

  return roundRuleValues;
}

export function getDefaultModeFormValues(roundTypes: RoundTypeDefinition[] = []): ModeFormValues {
  return {
    roundRules: buildRoundRuleValues(roundTypes),
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

export function buildFormValuesFromPreset(preset: GameModePresetState, roundTypes: RoundTypeDefinition[] = []): ModeFormValues {
  return {
    roundRules: buildRoundRuleValues(roundTypes, preset.round_rules),
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

export function getActiveRoundTypes(values: ModeFormValues, roundTypes: RoundTypeDefinition[] = []): string[] {
  const orderedRoundTypes = roundTypes.length > 0
    ? roundTypes
    : Object.keys(values.roundRules).map((kind) => ({ kind, label: kind, requires_phone_connections: false, default_every_n_songs: 1 }));

  return orderedRoundTypes
    .filter((roundType) => values.roundRules[roundType.kind]?.enabled)
    .map((roundType) => roundType.kind);
}

export function getRequiredPhoneRoundTypes(values: ModeFormValues, roundTypes: RoundTypeDefinition[] = []): string[] {
  const roundTypeMap = new Map(roundTypes.map((roundType) => [roundType.kind, roundType]));
  return getActiveRoundTypes(values, roundTypes).filter((roundType) => roundTypeMap.get(roundType)?.requires_phone_connections ?? ROUND_TYPES_REQUIRING_PHONES.has(roundType));
}

export function getConfiguredStageDurations(values: Pick<ModeFormValues, 'snippet1Duration' | 'snippet2Duration' | 'snippet3Duration'>): number[] {
  const rawValues = [values.snippet1Duration, values.snippet2Duration, values.snippet3Duration].map((value) =>
    Number.parseInt(value, 10),
  );
  return rawValues.map((value, index) =>
    Number.isFinite(value) && value > 0 ? value : LOCAL_STAGE_DURATIONS_DEFAULT[index],
  );
}

export function buildModeConfig(values: ModeFormValues, roundTypes: RoundTypeDefinition[] = []): GameModeConfig {
  const stageDurations = [values.snippet1Duration, values.snippet2Duration, values.snippet3Duration].map((value) =>
    Number.parseInt(value, 10),
  );
  const stagePoints = [values.snippet1Points, values.snippet2Points, values.snippet3Points].map((value) =>
    Number.parseInt(value, 10),
  );
  const rules: { kind: string; every_n_songs: number }[] = [];

  const orderedRoundTypes = roundTypes.length > 0
    ? roundTypes
    : Object.keys(values.roundRules).map((kind) => ({ kind, label: kind, requires_phone_connections: false, default_every_n_songs: 1 }));

  for (const roundType of orderedRoundTypes) {
    const ruleValues = values.roundRules[roundType.kind];
    if (!ruleValues?.enabled) {
      continue;
    }

    const everySongs = Number.parseInt(ruleValues.every_n_songs, 10);
    if (Number.isFinite(everySongs) && everySongs > 0) {
      rules.push({ kind: roundType.kind, every_n_songs: everySongs });
    }
  }

  const fromYear = Number.parseInt(values.releaseYearFrom, 10);
  const toYear = Number.parseInt(values.releaseYearTo, 10);
  const bothBonus = Number.parseInt(values.bothBonusPoints, 10);
  const wrongPenalty = Number.parseInt(values.wrongGuessPenalty, 10);
  const winRequired = Number.parseInt(values.requiredPointsToWin, 10);

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

export async function validateGameModeConfig(
  values: ModeFormValues,
  roundTypes: RoundTypeDefinition[] = [],
): Promise<{ valid: boolean; error?: string }> {
  const { api } = await import('./api');
  try {
    const config = buildModeConfig(values, roundTypes);
    const result = await api.validateGameMode(config);
    return result.data;
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Validation failed',
    };
  }
}
