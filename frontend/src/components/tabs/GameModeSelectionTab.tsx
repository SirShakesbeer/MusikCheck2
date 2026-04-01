import { Button, StatusChip } from '../ui';
import type { GameModePresetState } from '../../types';
import { ChangeEvent } from 'react';


type Props = {
  gameModes: GameModePresetState[];
  selectedPresetKey: string;
  customModeSelected: boolean;
  runtimeConfigBusy: boolean;
  onSelectPreset: (preset: GameModePresetState) => void;
  onSelectCustom: () => void;
};

export function GameModeSelectionTab({
  gameModes,
  selectedPresetKey,
  customModeSelected,
  onSelectPreset,
  onSelectCustom,
}: Props) {
  const cardClass = (selected: boolean) =>
    [
      'w-full rounded-2xl border px-4 py-4 text-left transition',
      selected
        ? 'border-mc-cyan bg-mc-cyan/10 shadow-[0_0_0_1px_rgba(61,221,255,0.35)]'
        : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10',
    ].join(' ');

  return (
    <div>

      <div className="grid gap-3 md:grid-cols-2">
        {gameModes.map((preset) => (
          <button
            key={preset.key}
            onClick={() => onSelectPreset(preset)}
            className={cardClass(selectedPresetKey === preset.key && !customModeSelected)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="block text-lg">{preset.name}</strong>
                <p className="muted-copy mt-1">
                  {preset.requires_phone_connections ? 'Requires phone connections' : 'No phone required'}
                </p>
              </div>
              {selectedPresetKey === preset.key && !customModeSelected && <StatusChip tone="ok">Selected</StatusChip>}
            </div>
          </button>
        ))}

        <button
          type="button"
          onClick={onSelectCustom}
          className={cardClass(customModeSelected)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong className="block text-lg">Custom Game</strong>
              <p className="muted-copy mt-1">Create your own round mix and frequencies</p>
            </div>
            {customModeSelected && <StatusChip tone="ok">Selected</StatusChip>}
          </div>
        </button>
      </div>
      
    </div>
  );
}
