import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import MonitorDetail from './pages/MonitorDetail';
import MonitorDevices from './pages/MonitorDevices';
import DeviceDetail from './pages/DeviceDetail';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Agents from './pages/Agents';

function RequireAuth() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route path="/"              element={<Dashboard />} />
                <Route path="/clients"       element={<Clients />} />
                <Route path="/clients/:id"   element={<ClientDetail />} />
                <Route path="/monitors/:id"  element={<MonitorDetail />} />
                <Route path="/monitors/:id/devices" element={<MonitorDevices />} />
                <Route path="/agents"        element={<Agents />} />
                <Route path="/devices/:id"   element={<DeviceDetail />} />
                <Route path="/reports"       element={<Reports />} />
                <Route path="/settings"      element={<Settings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
