import { AlertTriangle } from 'lucide-react';
import ZoneLabel from '../../../../shared/components/ZoneLabel';
import EstadoChip from '../../../../shared/components/EstadoChip';
import SupplyLevelBar from '../../../../shared/components/SupplyLevelBar';
import { fmtDate, fmtInt, type SupplyRow } from '../../../../shared/lib/supplies';
import type { DeviceDetailData } from '../../types/deviceDetailPage';

const GRID_COLS = 'grid-cols-[minmax(210px,1fr)_110px_120px_160px_132px_130px_130px]';

const SWATCH_HEX: Record<SupplyRow['color'], string> = {
  Negro: '#2E3033', Cian: '#7FB8C4', Magenta: '#C48BA8', Amarillo: '#E8C776', 'Sin color': '#DDE1E2',
};

const HEADERS = ['CONSUMIBLE', 'COLOR', 'ESTADO', 'NIVEL RESTANTE', 'CÓDIGO', 'PÁG. RESTANTES', 'INSTALADO'];

/** "Consumibles actuales" (handoff hifi "Dispositivo — detalle", 25/08/2026,
 * §6 punto 8) — grid denso con swatch real del cartucho, código en mono con
 * ellipsis (antes se cortaba a mitad de glifo) y páginas restantes en severo
 * si < 1.000. El estado del chip se deriva del % (no del string libre que
 * reporta el agente, que no es un enum normalizado entre fabricantes). */
export default function SuppliesTable({ device, supplyRows }: { device: DeviceDetailData | null; supplyRows: SupplyRow[] }) {
  const belowWarning = supplyRows.filter((r) => r.percentage != null && r.percentage <= 20).length;
  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3.5">
        <ZoneLabel text={`Consumibles actuales · ${supplyRows.length} instalados`} lineColorClass="bg-brand" />
        {device?.supply_origin === 'non_genuine' && (
          <span className="flex items-center gap-1.5 font-sans text-[11.5px] text-brand-accent"><AlertTriangle size={13} />Al menos un consumible no original</span>
        )}
      </div>
      <div className="rounded-[5px] border border-line-100 bg-white">
        {supplyRows.length ? (
          <>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 1160 }}>
                <div role="row" className={`grid ${GRID_COLS} items-center gap-3.5 border-b border-line-100 bg-surface-table-head px-5 py-3`}>
                  {HEADERS.map((h) => <span key={h} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300 last:text-right [&:nth-child(6)]:text-right">{h}</span>)}
                </div>
                {supplyRows.map((r) => <SupplyRowLine key={r.key} r={r} />)}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
              <span className="font-sans text-[12px] text-ink-100">
                {supplyRows.length} consumibles{belowWarning > 0 && ` · ${belowWarning} por debajo del umbral de advertencia (20%)`}
              </span>
            </div>
          </>
        ) : (
          <div className="p-10 text-center font-sans text-[12.5px] text-ink-300">El agente no reportó consumibles para este equipo</div>
        )}
      </div>
    </div>
  );
}

function SupplyRowLine({ r }: { r: SupplyRow }) {
  const attention = r.percentage != null && r.percentage <= 35;
  const lowPages = r.remainingPages != null && r.remainingPages < 1000;
  return (
    <div role="row" className={`grid ${GRID_COLS} min-h-[54px] items-center gap-3.5 border-b border-line-200 px-5 py-[11px] last:border-0`}>
      <span className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{r.description}</span>
      <span className="flex items-center gap-2 font-sans text-[12px] text-ink-700">
        <span className="block h-2.5 w-2.5 rounded-[2px] border border-line-200" style={{ background: SWATCH_HEX[r.color] }} />
        {r.color}
      </span>
      {r.percentage != null
        ? <EstadoChip variant={attention ? 'attention' : 'neutral'} label={attention ? 'ADVERTENCIA' : 'OK'} />
        : <span className="justify-self-start font-sans text-[12px] text-ink-200">—</span>}
      <SupplyLevelBar pct={r.percentage} fillColor={r.color !== 'Sin color' ? SWATCH_HEX[r.color] : undefined} />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px] text-ink-700" title={r.code ?? undefined}>{r.code ?? '—'}</span>
      <span className={`text-right font-montserrat text-[12.5px] font-semibold tabular-nums ${lowPages ? 'text-brand-severe' : 'text-ink-600'}`}>{fmtInt(r.remainingPages)}</span>
      <span className="text-right font-sans text-[12px] text-ink-300">{fmtDate(r.firstInstallDate)}</span>
    </div>
  );
}
