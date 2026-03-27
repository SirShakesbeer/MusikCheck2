import { create } from 'zustand';

export type SetupStep = 'mode-cards' | 'mode-details' | 'game-setup';

type HostSetupStore = {
  setupStep: SetupStep;
  modeDetailsEditable: boolean;
  modeDetailsTitle: string;
  setSetupStep: (step: SetupStep) => void;
  setModeDetailsEditable: (value: boolean) => void;
  setModeDetailsTitle: (value: string) => void;
  resetSetup: () => void;
};

export const useHostSetupStore = create<HostSetupStore>((set) => ({
  setupStep: 'mode-cards',
  modeDetailsEditable: false,
  modeDetailsTitle: '',
  setSetupStep: (setupStep) => set({ setupStep }),
  setModeDetailsEditable: (modeDetailsEditable) => set({ modeDetailsEditable }),
  setModeDetailsTitle: (modeDetailsTitle) => set({ modeDetailsTitle }),
  resetSetup: () =>
    set({
      setupStep: 'mode-cards',
      modeDetailsEditable: false,
      modeDetailsTitle: '',
    }),
}));
