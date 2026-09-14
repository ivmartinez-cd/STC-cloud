import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '../../../../store/AuthContext';
import { useEwsGateway, useRemoteEwsFlag } from '../../hooks/useEwsGateway';
import type { DeviceDetailData } from '../../types/deviceDetailPage';

const LINK = 'inline-flex items-center gap-1 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em]';

/** Asume el panel embebido del fabricante en la IP del equipo (http, puerto por defecto) — mejor esfuerzo, sólo sirve desde la red del cliente. */
const LanLink = ({ ip }: { ip: string | null }) => ip && (
  <a href={`http://${ip}`} target="_blank" rel="noreferrer" className={`${LINK} text-brand-accent hover:underline`}>
    Abrir panel web →
  </a>
);

const closedMessage = (closed: number) =>
  closed === 0 ? 'no había sesiones' : `${closed} sesión${closed === 1 ? '' : 'es'} cerrada${closed === 1 ? '' : 's'}`;

/** Botones del gateway: abrir (pestaña nueva, por el túnel del agente) y cerrar las sesiones del monitor. */
const GatewayButtons = ({ device }: { device: DeviceDetailData }) => {
  const { opening, error, open, close, closed } = useEwsGateway(device.agent_id, device.id);
  return (
    <span className="flex flex-wrap items-center justify-end gap-3">
      {error && <span className="font-sans text-[11px] normal-case tracking-normal text-severity-critical">{error}</span>}
      {closed !== null && !error && <span className="font-sans text-[11px] text-ink-400">{closedMessage(closed)}</span>}
      <button type="button" onClick={() => void close()} title="Cierra todas las sesiones de EWS abiertas contra los equipos de este monitor"
        className={`${LINK} text-ink-400 hover:text-ink-700`}>
        <XCircle size={11} /> Cerrar sesiones
      </button>
      <button type="button" onClick={() => void open()} disabled={opening} title="Se abre en una pestaña nueva y se navega como si estuvieras en la red del cliente"
        className={`${LINK} text-brand-accent hover:underline disabled:opacity-60`}>
        {opening ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />} Abrir la web del equipo
      </button>
    </span>
  );
};

/**
 * Acceso a la web embebida (EWS) del equipo, en la esquina de "Identificación":
 * - admin/operator con el permiso del monitor habilitado: el gateway (túnel
 *   sobre el WSS del agente, sección 10 de la auditoría de IT; requiere
 *   agente 1.3.4+). Sin permiso: link a habilitarlo en el monitor.
 * - client_viewer: el link directo a la IP, que desde la red del cliente sí
 *   llega. El gateway le está vedado del lado del backend (no está en
 *   `CLIENT_VIEWER_ROUTES`), así que acá ni se ofrece.
 */
export default function EwsAccessLink({ device }: { device: DeviceDetailData }) {
  const { role } = useAuth();
  const staff = role === 'admin' || role === 'operator';
  const enabled = useRemoteEwsFlag(staff ? device.agent_id : null);
  if (!staff) return <LanLink ip={device.ip_address} />;
  if (enabled === null || !device.agent_id) return null;
  if (!enabled) {
    return (
      <Link to={`/monitors/${device.agent_id}?tab=config`} title="El acceso remoto a la web embebida viene apagado de fábrica y se habilita por monitor"
        className={`${LINK} text-ink-400 hover:text-ink-700 hover:underline`}>
        Habilitar web del equipo →
      </Link>
    );
  }
  return <GatewayButtons device={device} />;
}
