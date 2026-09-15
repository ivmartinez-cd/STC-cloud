import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { SupplyRow } from '../../types/supplies';
import type { SupplyHistoryDevice } from '../../types/supplyHistory';
import { fmtDate, fmtInt } from '../../lib/supplies';
import { formatDateTime } from '../../lib/formatters';
import { SWATCH_HEX } from '../../lib/supplyColors';
import SupplyLevelBar from '../SupplyLevelBar';
import { Card, CardTitle, Row } from './primitives';

function ColorValue({ supply }: { supply: SupplyRow }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="block h-2.5 w-2.5 rounded-[2px] border border-line-200" style={{ background: SWATCH_HEX[supply.color] }} />
      {supply.color}
    </span>
  );
}

/**
 * Ficha de identificación (columna izquierda del SDS). Todo sale de la MISMA
 * fila que calcula el backend para la tabla, así que el modal nunca muestra
 * un número distinto del listado. Los campos que el equipo no informa quedan
 * en "—": no se derivan ni se completan con el promedio de nada.
 *
 * Diferencias declaradas contra el SDS: no hay "rendimiento ajustado / del
 * pedido" (es el rendimiento declarado del SKU y no tenemos catálogo de
 * consumibles), y la descripción es la normalizada del sistema, no el string
 * crudo de `prtMarkerSuppliesDescription` (el agente lo usa para clasificar
 * el consumible pero hoy no lo persiste).
 */
export default function SupplyIdentificationCard({ supply, device }: { supply: SupplyRow; device: SupplyHistoryDevice }) {
  return (
    <Card>
      <CardTitle right={
        <Link to={`/devices/${device.id}`} className="flex items-center gap-1 font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-brand-accent hover:text-brand">
          Ver dispositivo <ArrowRight size={11} />
        </Link>
      }>Identificación</CardTitle>
      <div className="px-5 py-1">
        <Row label="Cliente" value={device.client_name ?? '—'} />
        <Row label="Dispositivo" value={device.serial_number ?? '—'} mono />
        <Row label="Modelo" value={device.model ?? '—'} />
        <Row label="Descripción" value={supply.description} />
        <Row label="Tipo" value={supply.kind} />
        <Row label="Color" value={<ColorValue supply={supply} />} />
        <Row label="Número de serie" value={supply.serial ?? '—'} mono />
        <Row label="SKU instalado" value={supply.code ?? '—'} mono />
        <Row label="SKU de pedido" value={supply.orderNumber ?? '—'} mono />
        <Row label="Capacidad" value={fmtInt(supply.capacity)} />
        <Row label="Páginas impresas" value={fmtInt(supply.printed)} />
        <Row label="Ciclos de trabajo" value={fmtInt(device.engine_cycles)} />
        <Row label="Instalado" value={fmtDate(supply.firstInstallDate)} />
        <Row label="Última lectura" value={formatDateTime(device.last_seen)} />
      </div>
      <div className="border-t border-line-150 px-5 py-3.5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Nivel actual</span>
          <span className="font-montserrat text-[24px] font-extrabold leading-none tracking-[-.02em] tabular-nums text-ink-900">
            {supply.percentage != null ? `${supply.percentage}%` : '—'}
          </span>
        </div>
        <SupplyLevelBar pct={supply.percentage} fillColor={supply.color !== 'Sin color' ? SWATCH_HEX[supply.color] : undefined} showValue={false} />
        <div className="mt-2 flex justify-between font-sans text-[11px] text-ink-300">
          <span>{supply.remainingDays != null ? `${supply.remainingDays} días restantes` : 'Sin estimación de días'}</span>
          <span>{supply.remainingPages != null ? `${fmtInt(supply.remainingPages)} páginas restantes` : ''}</span>
        </div>
      </div>
    </Card>
  );
}
