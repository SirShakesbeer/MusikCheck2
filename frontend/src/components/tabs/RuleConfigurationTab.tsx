import { ChangeEvent } from 'react';
import { Slider } from 'antd';

import { Button, Card, Field, StatusChip } from '../ui';
import { RELEASE_YEAR_FILTER_DEFAULTS } from '../../config/defaults';
import type { ModeFormValues } from '../../services/gameModeFormService';
import type { RoundTypeDefinition, RoundTypeMetadata } from '../../types';

type Props = {
  modeDetailsTitle: string;
  modeDetailsEditable: boolean;
  modeFormValues: ModeFormValues;
  availableRoundTypes: RoundTypeDefinition[];
  roundTypesMetadata: RoundTypeMetadata[];
  requiredPhoneRoundTypes: string[];
  newPresetName: string;
  onFieldChange: <K extends keyof ModeFormValues>(field: K, value: ModeFormValues[K]) => void;
  onRoundRuleChange: (roundKind: string, nextValues: { enabled?: boolean; every_n_songs?: string; [option: string]: any }) => void;
  onNewPresetNameChange: (value: string) => void;
  onSavePreset: () => void;
  onContinue: () => void;
};

export function RuleConfigurationTab({
  modeDetailsTitle,
  modeDetailsEditable,
  modeFormValues,
  availableRoundTypes,
  roundTypesMetadata,
  requiredPhoneRoundTypes,
  newPresetName,
  onFieldChange,
  onRoundRuleChange,
  onNewPresetNameChange,
  onSavePreset,
  onContinue,
}: Props) {
  const releaseYearFrom = modeFormValues.releaseYearFrom
    ? Number.parseInt(modeFormValues.releaseYearFrom, 10)
    : RELEASE_YEAR_FILTER_DEFAULTS.from;
  const releaseYearTo = modeFormValues.releaseYearTo
    ? Number.parseInt(modeFormValues.releaseYearTo, 10)
    : RELEASE_YEAR_FILTER_DEFAULTS.to;
  const safeReleaseYearFrom = Number.isFinite(releaseYearFrom) ? releaseYearFrom : RELEASE_YEAR_FILTER_DEFAULTS.from;
  const safeReleaseYearTo = Number.isFinite(releaseYearTo) ? releaseYearTo : RELEASE_YEAR_FILTER_DEFAULTS.to;
  const displayReleaseYearFrom = modeFormValues.releaseYearFrom || 'Any';
  const displayReleaseYearTo = modeFormValues.releaseYearTo || 'Any';
  const modeFieldNames = new Set<keyof ModeFormValues>([
    'snippet1Duration',
    'snippet1Points',
    'snippet2Duration',
    'snippet2Points',
    'snippet3Duration',
    'snippet3Points',
  ]);

  const roundTypeRows = availableRoundTypes.map((roundType) => {
    const roundRule = modeFormValues.roundRules[roundType.kind] ?? {
      enabled: false,
      every_n_songs: String(roundType.default_every_n_songs),
    };
    // Find metadata for this round type
    const roundTypeMeta = roundTypesMetadata.find((meta) => meta.kind === roundType.kind);

    return (
      <div key={roundType.kind} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold uppercase tracking-wide text-cyan-50">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={roundRule.enabled}
                disabled={!modeDetailsEditable}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onRoundRuleChange(roundType.kind, { enabled: event.target.checked })}
                className="h-4 w-4 min-h-0"
              />
              <span>{roundType.label}</span>
            </label>

            <span className="text-cyan-50/70">every</span>

            <input
              type="number"
              min={1}
              value={roundRule.every_n_songs}
              disabled={!modeDetailsEditable || !roundRule.enabled}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onRoundRuleChange(roundType.kind, { every_n_songs: event.target.value })}
              className="w-24"
            />

            <span className="text-cyan-50/70">rounds</span>
          </div>

          <div className="text-xs uppercase tracking-wide text-cyan-50/70">
            {roundType.requires_phone_connections ? 'Phones required' : 'Phones optional'}
          </div>
        </div>

        {/* Render round-specific options below if enabled */}
        {roundRule.enabled && roundTypeMeta && roundTypeMeta.options.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {roundTypeMeta.options.map((opt) => {
              const isModeField = modeFieldNames.has(opt.name as keyof ModeFormValues);
              const modeFieldKey = opt.name as keyof ModeFormValues;
              const value = isModeField
                ? (modeFormValues[modeFieldKey] as string)
                : (roundRule[opt.name] ?? opt.default ?? '');
              let inputField = null;
              if (opt.type === 'int' || opt.type === 'float') {
                inputField = (
                  <input
                    type="number"
                    min={opt.min}
                    max={opt.max}
                    step={opt.type === 'float' ? 'any' : 1}
                    value={value}
                    disabled={!modeDetailsEditable}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      if (isModeField) {
                        onFieldChange(modeFieldKey, event.target.value as ModeFormValues[keyof ModeFormValues]);
                      } else {
                        onRoundRuleChange(roundType.kind, { [opt.name]: event.target.value });
                      }
                    }}
                  />
                );
              } else if (opt.type === 'bool') {
                inputField = (
                  <input
                    type="checkbox"
                    checked={!!value}
                    disabled={!modeDetailsEditable}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onRoundRuleChange(roundType.kind, { [opt.name]: event.target.checked })}
                  />
                );
              } else if (opt.type === 'str' && opt.choices && opt.choices.length > 0) {
                inputField = (
                  <select
                    value={value}
                    disabled={!modeDetailsEditable}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => onRoundRuleChange(roundType.kind, { [opt.name]: event.target.value })}
                  >
                    {opt.choices.map((choice) => (
                      <option key={choice} value={choice}>{choice}</option>
                    ))}
                  </select>
                );
              } else {
                inputField = (
                  <input
                    type="text"
                    value={value}
                    disabled={!modeDetailsEditable}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onRoundRuleChange(roundType.kind, { [opt.name]: event.target.value })}
                  />
                );
              }
              return (
                <Field key={opt.name} label={opt.label} hint={opt.description}>
                  {inputField}
                </Field>
              );
            })}
          </div>
        )}

        {roundRule.enabled && roundTypeMeta && roundTypeMeta.options.length === 0 && (
          <p className="mt-3 text-xs uppercase tracking-wide text-cyan-50/60">
            No round-specific options yet.
          </p>
        )}
      </div>
    );
  });

  const onReleaseYearWindowChange = (value: number[]) => {
    if (value.length < 2) {
      return;
    }

    const nextFrom = Math.max(RELEASE_YEAR_FILTER_DEFAULTS.min, Math.min(value[0], value[1]));
    const nextTo = Math.min(RELEASE_YEAR_FILTER_DEFAULTS.max, Math.max(value[0], value[1]));
    onFieldChange('releaseYearFrom', String(nextFrom));
    onFieldChange('releaseYearTo', String(nextTo));
  };

  return (
    <div>
      <p>
        {modeDetailsEditable
        ? 'Configure round types and frequencies.'
        : 'Preset settings are read-only. You can continue or pick another tab.'}
      </p>

      {availableRoundTypes.length > 0 ? (
        <div className="space-y-3">{roundTypeRows}</div>
      ) : (
        <Card>
          <p className="muted-copy">Loading available round types...</p>
        </Card>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Field label="Bonus (artist + title)">
          <input
            type="number"
            min={0}
            value={modeFormValues.bothBonusPoints}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('bothBonusPoints', event.target.value)}
          />
        </Field>
        <Field label="Wrong guess penalty">
          <input
            type="number"
            min={0}
            value={modeFormValues.wrongGuessPenalty}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('wrongGuessPenalty', event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-cyan-50/70">General settings</p>

        <Field label="Release year window">
          <div className="space-y-4">
            <div className="relative pt-8">
              <div className="absolute left-0 right-0 top-0 flex items-center justify-between text-xs uppercase tracking-wide text-cyan-50/80">
                <span>{displayReleaseYearFrom}</span>
                <span>{displayReleaseYearTo}</span>
              </div>
              <Slider
                range
                min={RELEASE_YEAR_FILTER_DEFAULTS.min}
                max={RELEASE_YEAR_FILTER_DEFAULTS.max}
                step={1}
                value={[safeReleaseYearFrom, safeReleaseYearTo]}
                onChange={onReleaseYearWindowChange}
                disabled={!modeDetailsEditable}
                tooltip={{ formatter: (value) => `${value ?? ''}` }}
              />
              <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-wide text-cyan-50/70">
                <span>{RELEASE_YEAR_FILTER_DEFAULTS.min}</span>
                <span>{RELEASE_YEAR_FILTER_DEFAULTS.max}</span>
              </div>
            </div>
            <p className="muted-copy text-sm">
              Drag both handles to set the window. The filter is inclusive, and tracks without a known year are skipped when a window is set.
            </p>
          </div>
        </Field>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Required points to win">
            <input
              type="number"
              min={1}
              value={modeFormValues.requiredPointsToWin}
              disabled={!modeDetailsEditable}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('requiredPointsToWin', event.target.value)}
            />
          </Field>
        </div>
      </div>

      {requiredPhoneRoundTypes.length > 0 && (
        <StatusChip>Round type {requiredPhoneRoundTypes.join(', ')} requires phones to be connected.</StatusChip>
      )}

      {modeDetailsEditable && (
        <>
          <Field label="Preset name">
            <input
              value={newPresetName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onNewPresetNameChange(event.target.value)}
              placeholder="My custom mode"
            />
          </Field>
          <Button onClick={onSavePreset} disabled={!newPresetName.trim()}>Save Preset</Button>
        </>
      )}

      <div className="mt-3">
        <Button onClick={onContinue} variant="secondary">Continue to Sources And Players</Button>
      </div>
    </div>
  );
}
