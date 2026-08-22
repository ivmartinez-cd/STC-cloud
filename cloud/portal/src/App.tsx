import { lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';

const Dashboard    = lazy(() => import('./pages/Dashboard'));
const Clients      = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const MonitorDetail   = lazy(() => import('./pages/MonitorDetail'));
const DeviceDetail = lazy(() => import('./pages/DeviceDetail'));
const Settings     = lazy(() => import('./pages/Settings'));
const Agents       = lazy(() => import('./pages/Agents'));
const Alerts       = lazy(() => import('./pages/Alerts'));

function RequireAuth() {
  const { isAuthenticated, checking } = useAuth();
  if (checking) return null;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

/**
 * Bloquea el acceso directo por URL a rutas que no aparecen en el nav para el rol
 * actual (ver `Layout.tsx` navItems) — sin esto, ocultar el ítem del menú no evita
 * que un `client_viewer` navegue a `/agents` a mano. `Agents.tsx` gestiona monitores
 * de un cliente cualquiera (revocar, regenerar clave, config) — no es sólo lectura,
 * a diferencia de `/monitors/:id`, que sí queda accesible para un viewer (con sus
 * propias pestañas/acciones restringidas en la página).
 */
function RequireRole({ allowed }: { allowed: string[] }) {
  const { role } = useAuth();
  return allowed.includes(role) ? <Outlet /> : <Navigate to="/" replace />;
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
                <Route path="/alerts"        element={<Alerts />} />
                <Route path="/clients"       element={<Clients />} />
                <Route path="/clients/:id"   element={<ClientDetail />} />
                <Route path="/monitors/:id"  element={<MonitorDetail />} />
                <Route element={<RequireRole allowed={['admin', 'operator']} />}>
                  <Route path="/agents"      element={<Agents />} />
                </Route>
                <Route path="/devices/:id"   element={<DeviceDetail />} />
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
