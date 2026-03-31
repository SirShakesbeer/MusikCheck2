import { Navigate, Route, Routes } from 'react-router-dom';

import { HostLobbyPage } from './pages/HostLobbyPage';
import { HostSetupPage } from './pages/HostSetupPage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { PlayerPage } from './pages/PlayerPage';

export default function App() {
  return (
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
  );
}
