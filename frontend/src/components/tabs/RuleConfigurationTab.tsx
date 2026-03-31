import { ChangeEvent } from 'react';

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
    <section>
      <h3>{modeDetailsTitle || 'Game Mode Details'}</h3>
      <p>
        {modeDetailsEditable
          ? 'Configure round types and frequencies.'
          : 'Preset settings are read-only. You can continue or pick another tab.'}
      </p>

      <div className="source-row">
        <label>
          <input
            type="checkbox"
            checked={modeFormValues.audioEnabled}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('audioEnabled', event.target.checked)}
          />
          Audio rounds
        </label>
        <label>
          <input
            type="checkbox"
            checked={modeFormValues.videoEnabled}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('videoEnabled', event.target.checked)}
          />
          Video rounds
        </label>
        <label>
          <input
            type="checkbox"
            checked={modeFormValues.lyricsEnabled}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('lyricsEnabled', event.target.checked)}
          />
          Lyrics rounds
        </label>
      </div>

      <div className="source-list">
        {modeFormValues.audioEnabled && (
          <label>
            Audio frequency (every N songs)
            <input
              type="number"
              min={1}
              value={modeFormValues.audioEverySongs}
              disabled={!modeDetailsEditable}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('audioEverySongs', event.target.value)}
            />
          </label>
        )}
        {modeFormValues.videoEnabled && (
          <label>
            Video frequency (every N songs)
            <input
              type="number"
              min={1}
              value={modeFormValues.videoEverySongs}
              disabled={!modeDetailsEditable}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('videoEverySongs', event.target.value)}
            />
          </label>
        )}
        {modeFormValues.lyricsEnabled && (
          <label>
            Lyrics frequency (every N songs)
            <input
              type="number"
              min={1}
              value={modeFormValues.lyricsEverySongs}
              disabled={!modeDetailsEditable}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('lyricsEverySongs', event.target.value)}
            />
          </label>
        )}
      </div>

      <div className="source-row">
        <label>
          Release year from
          <input
            type="number"
            value={modeFormValues.releaseYearFrom}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('releaseYearFrom', event.target.value)}
          />
        </label>
        <label>
          Release year to
          <input
            type="number"
            value={modeFormValues.releaseYearTo}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('releaseYearTo', event.target.value)}
          />
        </label>
        <label>
          Language
          <input
            value={modeFormValues.language}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('language', event.target.value)}
          />
        </label>
      </div>

      <div className="source-row">
        <label>
          Snippet 1 duration (s)
          <input
            type="number"
            min={1}
            value={modeFormValues.snippet1Duration}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet1Duration', event.target.value)}
          />
        </label>
        <label>
          Snippet 2 duration (s)
          <input
            type="number"
            min={1}
            value={modeFormValues.snippet2Duration}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet2Duration', event.target.value)}
          />
        </label>
        <label>
          Snippet 3 duration (s)
          <input
            type="number"
            min={1}
            value={modeFormValues.snippet3Duration}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet3Duration', event.target.value)}
          />
        </label>
      </div>

      <div className="source-row">
        <label>
          Snippet 1 points
          <input
            type="number"
            min={0}
            value={modeFormValues.snippet1Points}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet1Points', event.target.value)}
          />
        </label>
        <label>
          Snippet 2 points
          <input
            type="number"
            min={0}
            value={modeFormValues.snippet2Points}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet2Points', event.target.value)}
          />
        </label>
        <label>
          Snippet 3 points
          <input
            type="number"
            min={0}
            value={modeFormValues.snippet3Points}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('snippet3Points', event.target.value)}
          />
        </label>
      </div>

      <div className="source-row">
        <label>
          Bonus (artist + title)
          <input
            type="number"
            min={0}
            value={modeFormValues.bothBonusPoints}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('bothBonusPoints', event.target.value)}
          />
        </label>
        <label>
          Wrong guess penalty
          <input
            type="number"
            min={0}
            value={modeFormValues.wrongGuessPenalty}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('wrongGuessPenalty', event.target.value)}
          />
        </label>
        <label>
          Required points to win
          <input
            type="number"
            min={1}
            value={modeFormValues.requiredPointsToWin}
            disabled={!modeDetailsEditable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFieldChange('requiredPointsToWin', event.target.value)}
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
              onChange={(event: ChangeEvent<HTMLInputElement>) => onSaveAsPresetChange(event.target.checked)}
            />
            Save this setup as a new preset
          </label>
          <label>
            Preset name
            <input
              value={newPresetName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onNewPresetNameChange(event.target.value)}
              placeholder="My custom mode"
            />
          </label>
          <button onClick={onSavePreset}>Save Preset Now</button>
        </>
      )}

      <button onClick={onContinue}>Continue to Sources & Players</button>
    </section>
  );
}
