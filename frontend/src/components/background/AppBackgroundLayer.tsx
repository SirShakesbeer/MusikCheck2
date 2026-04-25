import { useEffect, useMemo, useState } from 'react';

import { useUiPreferencesStore } from '../../stores/uiPreferencesStore';
import { BackgroundScene3D } from './BackgroundScene3D';

function hasWebGlSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export function AppBackgroundLayer() {
  const backgroundMode = useUiPreferencesStore((store) => store.backgroundMode);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const enable3d = useMemo(() => {
    if (backgroundMode !== 'room-3d') {
      return false;
    }
    if (reduceMotion) {
      return false;
    }
    return hasWebGlSupport();
  }, [backgroundMode, reduceMotion]);

  if (!enable3d) {
    return null;
  }

  return (
    <div className="app-background-layer" aria-hidden="true">
      <BackgroundScene3D />
    </div>
  );
}
