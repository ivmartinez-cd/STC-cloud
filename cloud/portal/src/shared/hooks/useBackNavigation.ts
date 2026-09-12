import { useLocation, useNavigate } from 'react-router-dom';

/** Listado "padre" de cada sección de detalle. `/monitors/:id` vuelve a Clientes
 * (no existe `/monitors`, y `/agents` está gateado por rol: un `client_viewer`
 * rebotaría al Dashboard). */
const PARENT_BY_SECTION: Record<string, string> = {
  clients: '/clients',
  devices: '/devices',
  incidents: '/incidents',
  monitors: '/clients',
};

/**
 * "Volver" de una pantalla de detalle. Usa el historial del navegador cuando la
 * entrada actual fue empujada dentro de la app (`history.state.idx > 0`, lo que
 * React Router persiste en cada push): así se vuelve al listado CON sus filtros
 * y página. Si se entró por URL directa o refresh no hay historial propio, y
 * cae al listado padre en vez de sacar al usuario de la app. Derivar el padre
 * del path (`/monitors/:id` → `/monitors`) caía en rutas inexistentes.
 */
export function useBackNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const segments = location.pathname.split('/').filter(Boolean);
  const parentPath = PARENT_BY_SECTION[segments[0]] ?? '/';
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(parentPath);
  };
  return { show: segments.length > 1, goBack };
}
