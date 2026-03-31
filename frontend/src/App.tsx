import { Navigate, Route, Routes } from 'react-router-dom';

import { HostLobbyPage } from './pages/HostLobbyPage';
import { HostSetupPage } from './pages/HostSetupPage';
import { PlayerPage } from './pages/PlayerPage';

export default function App() {
  return (
    <Routes>
      <Route path="/host/setup" element={<HostSetupPage />} />
      <Route path="/host/lobby/:code" element={<HostLobbyPage />} />
      <Route path="/player/:code" element={<PlayerPage />} />
      <Route path="/host" element={<Navigate to="/host/setup" replace />} />
      <Route path="*" element={<Navigate to="/host/setup" replace />} />
    </Routes>
  );
}
