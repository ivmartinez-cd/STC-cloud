import { Card, CardTitle, Row } from './primitives';
import { formatDate } from '../../../../shared/lib/formatters';
import { POLL_LABEL } from './format';
import type { DeviceExtraInfo } from '../../../../shared/types/monitor';
import type { DeviceDetailData } from '../../types/deviceDetailPage';

/** "Datos del dispositivo" — filas label/valor uniformes. Sólo se renderizan
 * campos reales (transversal: "si un bloque no tiene datos, no se
 * renderiza") — el mockup dibuja 10 filas hipotéticas (contrato, SNMP por
 * equipo, próximo mantenimiento) que no existen como dato en este modelo. */
export default function DeviceSpecsCard({ device, extra }: { device: DeviceDetailData; extra: DeviceExtraInfo | undefined }) {
  return (
    <Card>
      <CardTitle>Datos del dispositivo</CardTitle>
      <div className="px-5 pb-3.5 pt-3.5">
        <Row label="Marca" value={extra?.manufacturer ?? device.brand} />
        <Row label="Modelo" value={device.model} />
        <Row label="Firmware" value={device.firmware} mono />
        {extra?.firmwarePackage && <Row label="Paquete de firmware" value={extra.firmwarePackage} mono />}
        <Row label="Alta en inventario" value={formatDate(device.created_at as unknown as string)} />
        <Row label="Gestión" value={POLL_LABEL[device.poll_method ?? 'unknown'] ?? device.poll_method} />
        {extra?.platform && <Row label="Plataforma" value={extra.platform} />}
        {(device.sku ?? extra?.sku) && <Row label="SKU / Nº de producto" value={device.sku ?? extra?.sku} mono />}
        <Row label="Último reporte" value={formatDate(device.last_seen as unknown as string)} />
      </div>
    </Card>
  );
}
