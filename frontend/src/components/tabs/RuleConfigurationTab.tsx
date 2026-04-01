import { ChangeEvent } from 'react';

import { Button, Card, Field, StatusChip } from '../ui';
import type { ModeFormValues } from '../../services/gameModeFormService';

type Props = {
  modeDetailsTitle: string;
  modeDetailsEditable: boolean;
  modeFormValues: ModeFormValues;
  requiredPhoneRoundTypes: string[];
  saveAsPreset: boolean;
  newPresetName: string;
  onFieldChange: <K extends keyof ModeFormValues>(field: K, value: ModeFormValues[K]) => void;
  onSaveAsPresetChange: (value: boolean) => void;
  onNewPresetNameChange: (value: string) => void;
  onSavePreset: () => void;
  onContinue: () => void;
};

export function RuleConfigurationTab({
  modeDetailsTitle,
  modeDetailsEditable,
  modeFormValues,
  requiredPhoneRoundTypes,
  saveAsPreset,
  newPresetName,
  onFieldChange,
  onSaveAsPresetChange,
  onNewPresetNameChange,
  onSavePreset,
  onContinue,
}: Props) {
  return (
    <div>
      <p>
        {modeDetailsEditable
        ? 'Configure round types and frequencies.'
        : 'Preset settings are read-only. You can continue or pick another tab.'}
      </p>
      
      <div className="source-row">
        <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-50">
          <input
            type="checkbox"
            checked={modeFormValues.audioEnabled}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('audioEnabled', event.target.checked)}
            className="min-h-0 h-4 w-4"
          />
          <span>Audio rounds</span>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-50">
          <input
            type="checkbox"
            checked={modeFormValues.videoEnabled}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('videoEnabled', event.target.checked)}
            className="min-h-0 h-4 w-4"
          />
          <span>Video rounds</span>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-50">
          <input
            type="checkbox"
            checked={modeFormValues.lyricsEnabled}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('lyricsEnabled', event.target.checked)}
            className="min-h-0 h-4 w-4"
          />
          <span>Lyrics rounds</span>
        </label>
      </div>

      <div className="source-list">
        {modeFormValues.audioEnabled && (
          <Field label="Audio frequency (every N songs)">
            <input
              type="number"
              min={1}
              value={modeFormValues.audioEverySongs}
              disabled={!modeDetailsEditable}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('audioEverySongs', event.target.value)}
            />
          </Field>
        )}
        {modeFormValues.videoEnabled && (
          <Field label="Video frequency (every N songs)">
            <input
              type="number"
              min={1}
              value={modeFormValues.videoEverySongs}
              disabled={!modeDetailsEditable}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('videoEverySongs', event.target.value)}
            />
          </Field>
        )}
        {modeFormValues.lyricsEnabled && (
          <Field label="Lyrics frequency (every N songs)">
            <input
              type="number"
              min={1}
              value={modeFormValues.lyricsEverySongs}
              disabled={!modeDetailsEditable}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('lyricsEverySongs', event.target.value)}
            />
          </Field>
        )}
      </div>

      <div className="source-row">
        <Field label="Release year from">
          <input
            type="number"
            value={modeFormValues.releaseYearFrom}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('releaseYearFrom', event.target.value)}
          />
        </Field>
        <Field label="Release year to">
          <input
            type="number"
            value={modeFormValues.releaseYearTo}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('releaseYearTo', event.target.value)}
          />
        </Field>
        <Field label="Language">
          <input
            value={modeFormValues.language}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('language', event.target.value)}
          />
        </Field>
      </div>

      <div className="source-row">
        <Field label="Snippet 1 duration (s)">
          <input
            type="number"
            min={1}
            value={modeFormValues.snippet1Duration}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet1Duration', event.target.value)}
          />
        </Field>
        <Field label="Snippet 2 duration (s)">
          <input
            type="number"
            min={1}
            value={modeFormValues.snippet2Duration}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet2Duration', event.target.value)}
          />
        </Field>
        <Field label="Snippet 3 duration (s)">
          <input
            type="number"
            min={1}
            value={modeFormValues.snippet3Duration}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet3Duration', event.target.value)}
          />
        </Field>
      </div>

      <div className="source-row">
        <Field label="Snippet 1 points">
          <input
            type="number"
            min={0}
            value={modeFormValues.snippet1Points}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet1Points', event.target.value)}
          />
        </Field>
        <Field label="Snippet 2 points">
          <input
            type="number"
            min={0}
            value={modeFormValues.snippet2Points}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet2Points', event.target.value)}
          />
        </Field>
        <Field label="Snippet 3 points">
          <input
            type="number"
            min={0}
            value={modeFormValues.snippet3Points}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet3Points', event.target.value)}
          />
        </Field>
      </div>

      <div className="source-row">
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

      {requiredPhoneRoundTypes.length > 0 && (
        <StatusChip>Round type {requiredPhoneRoundTypes.join(', ')} requires phones to be connected.</StatusChip>
      )}

      {modeDetailsEditable && (
        <>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-50">
            <input
              type="checkbox"
              checked={saveAsPreset}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onSaveAsPresetChange(event.target.checked)}
              className="min-h-0 h-4 w-4"
            />
            <span>Save this setup as a new preset</span>
          </label>
          <Field label="Preset name">
            <input
              value={newPresetName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onNewPresetNameChange(event.target.value)}
              placeholder="My custom mode"
            />
          </Field>
          <Button onClick={onSavePreset}>Save Preset Now</Button>
        </>
      )}

      <div className="source-row mt-3">
        <Button onClick={onContinue} variant="secondary">Continue to Sources And Players</Button>
      </div>
    </div>
  );
}
