import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppBackgroundLayer } from './components/background/AppBackgroundLayer';
import { GlobalOptionsMenu } from './components/GlobalOptionsMenu';
import { HostLobbyPage } from './pages/HostLobbyPage';
import { HostSetupPage } from './pages/HostSetupPage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { PlayerPage } from './pages/PlayerPage';
import { useThemeStore } from './stores/themeStore';
import { useUiPreferencesStore } from './stores/uiPreferencesStore';

export default function App() {
  const hydrateTheme = useThemeStore((store) => store.hydrateTheme);
  const hydratePreferences = useUiPreferencesStore((store) => store.hydratePreferences);

  useEffect(() => {
    hydrateTheme();
    hydratePreferences();
  }, [hydrateTheme, hydratePreferences]);

  return (
    <>
      <AppBackgroundLayer />
      <div className="app-route-layer">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/host/setup/:code" element={<HostSetupPage />} />
          <Route path="/host/setup" element={<Navigate to="/" replace />} />
          <Route path="/host/lobby/:code" element={<HostLobbyPage />} />
          <Route path="/player" element={<Navigate to="/join" replace />} />
          <Route path="/player/:code" element={<PlayerPage />} />
          <Route path="/host" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <GlobalOptionsMenu />
    </>
  );
}
