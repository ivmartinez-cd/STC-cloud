import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, Suspense, lazy } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';

const Dashboard    = lazy(() => import('./pages/Dashboard'));
const Clients      = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const MonitorDetail   = lazy(() => import('./pages/MonitorDetail'));
const MonitorDevices  = lazy(() => import('./pages/MonitorDevices'));
const DeviceDetail = lazy(() => import('./pages/DeviceDetail'));
const Reports      = lazy(() => import('./pages/Reports'));
const Settings     = lazy(() => import('./pages/Settings'));
const Agents       = lazy(() => import('./pages/Agents'));

function RequireAuth() {
  const { isAuthenticated, checking } = useAuth();
  if (checking) return null;
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
                <Suspense fallback={null}>
                  <Route path="/"              element={<Dashboard />} />
                  <Route path="/clients"       element={<Clients />} />
                  <Route path="/clients/:id"   element={<ClientDetail />} />
                  <Route path="/monitors/:id"  element={<MonitorDetail />} />
                  <Route path="/monitors/:id/devices" element={<MonitorDevices />} />
                  <Route path="/agents"        element={<Agents />} />
                  <Route path="/devices/:id"   element={<DeviceDetail />} />
                  <Route path="/reports"       element={<Reports />} />
                  <Route path="/settings"      element={<Settings />} />
                </Suspense>
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
