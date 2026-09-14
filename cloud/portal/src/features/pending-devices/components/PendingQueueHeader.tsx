import { useState } from 'react';
import { exportPendingQueueCsv } from '../lib/exportPendingQueueCsv';
import type { PendingQueueSegment } from '../types/pendingDevices';

const BTN_SECONDARY = 'rounded-[3px] border border-line-300 bg-white px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-ink-600 transition-colors duration-150 ease-in-out hover:border-line-hover hover:bg-surface-btn-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

interface Props {
  exportFilters: { query: string; clientId: string; segment: PendingQueueSegment };
}

/** Sólo exportar: aprobar la selección vive en la barra de selección, junto a
 * reasignar/fusionar/ignorar (auditoría de duplicados, 14/09/2026 — antes
 * estaba también acá, deshabilitado hasta seleccionar algo). */
function HeaderActions({ exportFilters }: Props) {
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try { await exportPendingQueueCsv(exportFilters); } finally { setExporting(false); }
  };
  return (
    <div className="flex gap-2.5">
      <button type="button" onClick={handleExport} disabled={exporting} className={BTN_SECONDARY}>{exporting ? 'EXPORTANDO…' : 'EXPORTAR'}</button>
    </div>
  );
}

/** Header (handoff hifi "Dispositivos pendientes", 25/08/2026) — el subtítulo
 * describe lo que significa aprobar un equipo, NUNCA el estado actual del
 * filtro (bug arreglado: antes leía "0 en la cola del cliente seleccionado"
 * incluso sin cliente elegido). */
export default function PendingQueueHeader(props: Props) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end short:mb-3 justify-between gap-4">
      <div>
        <div className="mb-2.5 flex items-center gap-3 short:mb-1.5">
          <span className="block h-0.5 w-5 bg-brand" />
          <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-300">COLA DE APROBACIÓN · DESCUBRIMIENTO AUTOMÁTICO</span>
        </div>
        <h1 className="m-0 font-montserrat text-[34px] font-extrabold short:text-[26px] leading-[1.05] tracking-[-.018em] text-ink-900">Dispositivos pendientes</h1>
        <p className="mt-2.5 max-w-[76ch] font-sans text-[12.5px] text-ink-400">
          Aprobar un equipo lo incorpora al inventario del cliente sugerido: a partir de ese momento empieza a reportar consumo y alertas, y se factura en el próximo cierre.
        </p>
      </div>
      <HeaderActions {...props} />
    </div>
  );
}
