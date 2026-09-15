import { REASON_LABELS, type SupplyRequestHistoryRow } from '../../types/supplyHistory';
import { fmtInt } from '../../lib/supplies';
import { formatDateTime } from '../../lib/formatters';
import EstadoChip from '../EstadoChip';
import { Card, CardTitle } from './primitives';

const GRID = 'grid-cols-[132px_78px_104px_96px_58px_62px_82px_82px_82px_82px_112px_132px]';

const HEADERS = [
  'FECHA', 'REFERENCIA', 'Nº DE SERIE', 'SKU', 'NIVEL', 'DÍAS REST.',
  'MONO', 'COLOR', 'Δ TOTAL', 'Δ COLOR', 'ESTADO', 'REEMPLAZADO',
];

const STATUS_LABELS: Record<string, string> = {
  pending: 'PENDIENTE', reviewed: 'CONSULTADA', processed: 'PROCESADA',
  completed: 'COMPLETADA', ignored: 'IGNORADA', cancelled: 'ELIMINADA',
};

const Cell = ({ children, right = false }: { children: React.ReactNode; right?: boolean }) => (
  <span className={`truncate font-sans text-[11.5px] tabular-nums text-ink-700 ${right ? 'text-right' : ''}`}>{children}</span>
);

function RequestRow({ r }: { r: SupplyRequestHistoryRow }) {
  return (
    <div className={`grid ${GRID} min-h-[44px] items-center gap-x-3 border-b border-line-200 px-5 py-2 last:border-0`}>
      <Cell>{formatDateTime(r.opened_at)}</Cell>
      <Cell>{r.external_ref ?? '—'}</Cell>
      <span className="truncate font-mono text-[11px] text-ink-700">{r.supply_serial ?? '—'}</span>
      <span className="truncate font-mono text-[11px] text-ink-700">{r.sku ?? '—'}</span>
      <Cell right>{r.level_pct != null ? `${r.level_pct}%` : '—'}</Cell>
      <Cell right>{r.remaining_days ?? '—'}</Cell>
      <Cell right>{fmtInt(r.mono_pages)}</Cell>
      <Cell right>{fmtInt(r.color_pages)}</Cell>
      <Cell right>{fmtInt(r.delta_total)}</Cell>
      <Cell right>{fmtInt(r.delta_color)}</Cell>
      <span className="justify-self-start">
        <EstadoChip
          label={STATUS_LABELS[r.status] ?? r.status.toUpperCase()}
          variant={r.status === 'completed' ? 'neutral' : 'attention'}
        />
      </span>
      <Cell>{r.replaced_at ? formatDateTime(r.replaced_at) : '—'}</Cell>
    </div>
  );
}

function ReasonsNote({ rows }: { rows: SupplyRequestHistoryRow[] }) {
  const reasons = [...new Set(rows.map((r) => r.reason).filter(Boolean))] as string[];
  if (!reasons.length) return null;
  return <span className="font-sans text-[11px] text-ink-300">Motivo: {reasons.map((x) => REASON_LABELS[x] ?? x).join(' · ')}</span>;
}

/**
 * "Historial de solicitudes de consumibles". Las columnas de contadores y la
 * serie del cartucho existen desde la migración 20260915120000: las
 * solicitudes anteriores muestran "—" en vez de un número inventado, y los Δ
 * quedan vacíos cuando falta el snapshot de alguna de las dos puntas.
 */
export default function SupplyRequestsHistory({ rows }: { rows: SupplyRequestHistoryRow[] }) {
  const completed = rows.filter((r) => r.status === 'completed').length;
  return (
    <Card>
      <CardTitle right={
        rows.length ? (
          <span className="flex items-center gap-3">
            <ReasonsNote rows={rows} />
            <span className="font-sans text-[11px] text-ink-300">{rows.length} solicitudes · {completed} completadas</span>
          </span>
        ) : undefined
      }>Historial de solicitudes de consumibles</CardTitle>
      {rows.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[1180px]">
            <div className={`grid ${GRID} items-center gap-x-3 border-b border-line-100 bg-surface-table-head px-5 py-2.5`}>
              {HEADERS.map((h, i) => (
                <span key={h} className={`font-montserrat text-[8px] font-bold uppercase tracking-[.13em] text-ink-300 ${i >= 4 && i <= 9 ? 'text-right' : ''}`}>{h}</span>
              ))}
            </div>
            {rows.map((r) => <RequestRow key={r.id} r={r} />)}
          </div>
        </div>
      ) : (
        <p className="px-5 py-8 text-center font-sans text-[12px] text-ink-300">
          Este consumible nunca generó una solicitud de reposición.
        </p>
      )}
    </Card>
  );
}
