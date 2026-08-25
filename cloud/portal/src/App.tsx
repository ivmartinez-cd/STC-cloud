import { lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { ToastProvider } from './store/ToastContext';
import Layout from './app/layout/Layout';
import Login from './features/auth/pages/Login';
import { stashCurrentPath } from './features/auth/lib/postLoginRedirect';

const Dashboard    = lazy(() => import('./features/dashboard/pages/Dashboard'));
const Clients      = lazy(() => import('./features/clients/pages/Clients'));
const ClientDetail = lazy(() => import('./features/clients/pages/ClientDetail'));
const MonitorDetail   = lazy(() => import('./features/monitors/pages/MonitorDetail'));
const DeviceDetail = lazy(() => import('./features/devices/pages/DeviceDetail'));
const Settings     = lazy(() => import('./features/settings/pages/Settings'));
const Agents       = lazy(() => import('./features/monitors/pages/Agents'));
const Alerts       = lazy(() => import('./features/alerts/pages/Alerts'));
const Reports      = lazy(() => import('./features/reports/pages/Reports'));
const ScheduledReports = lazy(() => import('./features/reports/pages/ScheduledReports'));
const SupplyRequests = lazy(() => import('./features/supplies/pages/SupplyRequests'));
const EmailLog = lazy(() => import('./features/email-log/pages/EmailLog'));
const RemoteActions = lazy(() => import('./features/monitors/pages/RemoteActions'));
const Activity     = lazy(() => import('./features/activity/pages/Activity'));
const PendingDevices = lazy(() => import('./features/pending-devices/pages/PendingDevices'));
const Supplies = lazy(() => import('./features/supplies/pages/Supplies'));
const Incidents = lazy(() => import('./features/incidents/pages/Incidents'));
const IncidentDetail = lazy(() => import('./features/incidents/pages/IncidentDetail'));

function RequireAuth() {
  const { isAuthenticated, checking } = useAuth();
  // Capturada en el render, NO releída dentro del efecto — ver el docblock
  // de `stashCurrentPath`: para cuando el efecto corre, el `<Navigate>`
  // hermano puede haber cambiado ya `window.location` a `/login`.
  const location = useLocation();
  const currentPath = location.pathname + location.search;
  useEffect(() => {
    if (!checking && !isAuthenticated) stashCurrentPath(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, isAuthenticated]);
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
                <Route path="/reports"       element={<Reports />} />
                <Route path="/supplies"      element={<Supplies />} />
                <Route path="/supply-requests" element={<SupplyRequests />} />
                <Route path="/incidents"     element={<Incidents />} />
                <Route path="/incidents/:id" element={<IncidentDetail />} />
                <Route path="/clients"       element={<Clients />} />
                <Route path="/clients/:id"   element={<ClientDetail />} />
                <Route path="/monitors/:id"  element={<MonitorDetail />} />
                <Route element={<RequireRole allowed={['admin', 'operator']} />}>
                  <Route path="/agents"      element={<Agents />} />
                  <Route path="/scheduled-reports" element={<ScheduledReports />} />
                  <Route path="/email-log" element={<EmailLog />} />
                  <Route path="/remote-actions" element={<RemoteActions />} />
                  <Route path="/activity"    element={<Activity />} />
                  <Route path="/pending"     element={<PendingDevices />} />
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
