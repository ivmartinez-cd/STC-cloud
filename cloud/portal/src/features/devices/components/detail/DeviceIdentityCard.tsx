import { Card, CardTitle, Row, DeviceImage } from './primitives';
import { formatRelativeTime } from '../../../../shared/lib/formatters';
import type { DeviceDetailData } from '../../types/deviceDetailPage';

/** Asume el panel embebido del fabricante en la IP del equipo (http, puerto
 * por defecto) — mejor esfuerzo, no hay un campo propio para esta URL. */
const WebPanelLink = ({ ip }: { ip: string | null }) => ip && (
  <a href={`http://${ip}`} target="_blank" rel="noreferrer" className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
    Abrir panel web →
  </a>
);

/** "Identificación" (handoff hifi "Dispositivo — detalle") — foto del
 * catálogo por marca/modelo (no hay carga de fotos por cliente) + filas
 * técnicas en mono. */
export default function DeviceIdentityCard({ device }: { device: DeviceDetailData }) {
  return (
    <Card>
      <CardTitle right={<WebPanelLink ip={device.ip_address} />}>Identificación</CardTitle>
      <div className="px-5 pb-[18px] pt-[18px]">
        <div className="mb-4 flex h-[150px] items-center justify-center overflow-hidden rounded-[3px] border border-line-150 bg-surface-input">
          <DeviceImage brand={device.brand} model={device.model} />
        </div>
        <Row label="ID del dispositivo" value={device.id.slice(0, 9)} mono />
        <Row label="Número de serie" value={device.serial_number} mono />
        <Row label="Dirección IP" value={device.ip_address} mono />
        <Row label="Dirección MAC" value={device.mac ? String(device.mac).toUpperCase() : null} mono />
        <Row label="Ubicación" value={device.location} />
        <Row label="Monitor" value={device.monitor_name} />
        <Row label="Último reporte" value={device.last_seen ? formatRelativeTime(device.last_seen).toLowerCase() : null} />
      </div>
    </Card>
  );
}
