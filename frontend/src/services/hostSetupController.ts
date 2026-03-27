import type { ModeFormValues } from './gameModeFormService';
import { buildModeConfig } from './gameModeFormService';
import { api } from './api';
import type { GameModePresetState, GameState } from '../types';
import type { SetupStep } from '../stores/hostSetupStore';

export async function ensurePhoneLobby(params: {
  state: GameState | null;
  hostName: string;
  selectedPresetKey: string;
  modeDetailsTitle: string;
  modeFormValues: ModeFormValues;
}): Promise<GameState | null> {
  if (params.state?.lobby_code) {
    return params.state;
  }

  const modeConfig = buildModeConfig(params.modeFormValues);
  const result = await api.createLobby({
    host_name: params.hostName,
    preset_key: params.selectedPresetKey,
    mode_config: modeConfig,
    save_as_preset: false,
    preset_name: params.modeDetailsTitle || undefined,
  });
  return result.data;
}

export async function continueToGameSetup(params: {
  state: GameState | null;
  hostName: string;
  selectedPresetKey: string;
  modeDetailsTitle: string;
  modeFormValues: ModeFormValues;
}): Promise<{ setupStep: SetupStep; state: GameState | null }> {
  const state = await ensurePhoneLobby(params);
  return {
    setupStep: 'game-setup',
    state,
  };
}

export async function saveCurrentPreset(params: {
  presetName: string;
  modeFormValues: ModeFormValues;
  gameModes: GameModePresetState[];
}): Promise<{
  gameModes: GameModePresetState[];
  selectedPresetKey: string;
  savedPreset: GameModePresetState;
}> {
  const name = params.presetName.trim();
  if (!name) {
    throw new Error('Enter a preset name first.');
  }

  const modeConfig = buildModeConfig(params.modeFormValues);
  const result = await api.createGameModePreset(name, modeConfig);
  const savedPreset = result.data.preset;

  const withoutDuplicate = params.gameModes.filter((item) => item.key !== savedPreset.key);
  return {
    gameModes: [...withoutDuplicate, savedPreset],
    selectedPresetKey: savedPreset.key,
    savedPreset,
  };
}

export function openPresetCard(params: {
  preset: GameModePresetState;
}): { selectedPresetKey: string; modeDetailsEditable: boolean; modeDetailsTitle: string; setupStep: SetupStep } {
  return {
    selectedPresetKey: params.preset.key,
    modeDetailsEditable: false,
    modeDetailsTitle: params.preset.name,
    setupStep: 'mode-details',
  };
}

export function openCustomCard(params: {
  gameModes: GameModePresetState[];
  selectedPresetKey: string;
}): {
  basePreset: GameModePresetState | null;
  modeDetailsEditable: boolean;
  modeDetailsTitle: string;
  setupStep: SetupStep;
} {
  const basePreset = params.gameModes.find((preset) => preset.key === params.selectedPresetKey) ?? params.gameModes[0] ?? null;
  return {
    basePreset,
    modeDetailsEditable: true,
    modeDetailsTitle: 'Custom Game',
    setupStep: 'mode-details',
  };
}
