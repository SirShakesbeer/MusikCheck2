import { Navigate, Route, Routes } from 'react-router-dom';

import { HostPage } from './pages/HostPage';
import { PlayerPage } from './pages/PlayerPage';

export default function App() {
  return (
    <Routes>
      <Route path="/host" element={<HostPage />} />
      <Route path="/player/:code" element={<PlayerPage />} />
      <Route path="*" element={<Navigate to="/host" replace />} />
    </Routes>
  );
}
