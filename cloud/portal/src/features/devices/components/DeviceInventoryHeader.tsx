import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { fmt } from '../../../shared/lib/formatters';
import { exportDeviceInventoryCsv } from '../lib/exportDeviceInventoryCsv';
import type { DeviceDirectorySegment, DeviceInventorySummary, SortDir } from '../types/deviceDirectory';

interface Props {
  summary: DeviceInventorySummary | null;
  query: string;
  segment: DeviceDirectorySegment;
  sortDir: SortDir;
  includeDecommissioned: boolean;
  onRefresh: () => void;
}

const BTN_SECONDARY = 'rounded-[3px] border border-line-300 bg-white px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-ink-600 transition-colors duration-150 ease-in-out hover:border-line-hover hover:bg-surface-btn-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

/** Exportar/actualizar/agregar (handoff hifi) — "+ AGREGAR DISPOSITIVO" manda al flujo
 * REAL de alta (cola de registro de `pending-devices`, Fase 7): acá no hay ni debería
 * haber un formulario manual, un equipo siempre entra vía descubrimiento de un agente. */
function HeaderActions({ query, segment, sortDir, includeDecommissioned, onRefresh }: Omit<Props, 'summary'>) {
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try { await exportDeviceInventoryCsv(query, segment, sortDir, includeDecommissioned); } finally { setExporting(false); }
  };
  return (
    <div className="flex gap-2.5">
      <button type="button" onClick={handleExport} disabled={exporting} className={BTN_SECONDARY}>{exporting ? 'EXPORTANDO…' : 'EXPORTAR CSV'}</button>
      <button type="button" onClick={onRefresh} className={`flex items-center gap-2 ${BTN_SECONDARY}`}>
        <RefreshCw size={12} /> ACTUALIZAR
      </button>
      <Link to="/pending-devices" className="rounded-[3px] bg-brand px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">+ AGREGAR DISPOSITIVO</Link>
    </div>
  );
}

export default function DeviceInventoryHeader({ summary, query, segment, sortDir, includeDecommissioned, onRefresh }: Props) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end short:mb-3 justify-between gap-4">
      <div>
        <div className="mb-2.5 flex items-center gap-3 short:mb-1.5">
          <span className="block h-0.5 w-5 bg-brand" />
          <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-300">CONTROL GLOBAL DE IMPRESORAS</span>
        </div>
        <h1 className="m-0 font-montserrat text-[34px] font-extrabold short:text-[26px] leading-[1.05] tracking-[-.018em] text-ink-900">Inventario de dispositivos</h1>
        {summary && (
          <p className="mt-2.5 font-sans text-[12.5px] text-ink-400">
            {fmt(summary.devices_total)} dispositivos · {fmt(summary.clients_total)} clientes · {fmt(summary.reporting_24h)} reportando en las últimas 24 h
          </p>
        )}
      </div>
      <HeaderActions query={query} segment={segment} sortDir={sortDir} includeDecommissioned={includeDecommissioned} onRefresh={onRefresh} />
    </div>
  );
}
