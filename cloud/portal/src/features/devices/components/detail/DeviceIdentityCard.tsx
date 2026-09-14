import { Card, CardTitle, Row, DeviceImage } from './primitives';
import EwsAccessLink from './EwsAccessLink';
import { formatRelativeTime } from '../../../../shared/lib/formatters';
import type { DeviceDetailData } from '../../types/deviceDetailPage';

/** "Identificación" (handoff hifi "Dispositivo — detalle") — foto del
 * catálogo por marca/modelo (no hay carga de fotos por cliente) + filas
 * técnicas en mono. En la esquina, el acceso a la web embebida del equipo. */
export default function DeviceIdentityCard({ device }: { device: DeviceDetailData }) {
  return (
    <Card>
      <CardTitle right={<EwsAccessLink device={device} />}>Identificación</CardTitle>
      <div className="px-5 pb-3.5 pt-3.5">
        <div className="mb-3 flex h-[104px] items-center justify-center overflow-hidden rounded-[3px] border border-line-150 bg-surface-input">
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
