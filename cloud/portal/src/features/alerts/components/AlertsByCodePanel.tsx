import { fmt, fmtPct } from '../../../shared/lib/formatters';
import type { AlertSummary } from '../../../shared/types/alerts';
import CardError from '../../../shared/components/CardError';

/** Sólo las 2 primeras filas (mayor volumen) llevan tono naranja — mismo criterio
 * de escala de severidad "dentro del naranja + gris" que `AlertsByClassPanel`. */
function dotColorAt(index: number): string {
  if (index === 0) return 'var(--color-brand-severe)';
  if (index === 1) return 'var(--color-brand)';
  return 'var(--color-ink-500)';
}

function CodeRow({ row, index, max, total }: { row: AlertSummary['byCode'][number]; index: number; max: number; total: number }) {
  const barPct = Math.max(1.5, max > 0 ? (row.count / max) * 100 : 0);
  const color = dotColorAt(index);
  return (
    <div className="grid grid-cols-[8px_minmax(0,130px)_1fr_78px] items-center gap-[10px] border-b border-line-200 py-2">
      <span className="block h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      <span className="truncate font-mono text-[11.5px] leading-[1.3] text-ink-700">{row.label}</span>
      <span className="block h-1.5 rounded-[3px] bg-surface-track">
        <span className="block h-full rounded-[3px]" style={{ width: `${barPct}%`, background: color }} />
      </span>
      <span className="text-right font-sans text-[11.5px] text-ink-400">{fmt(row.count)} · {fmtPct(row.count, total)}</span>
    </div>
  );
}

/** "El 92% son equipos o agentes sin señal" — conclusión escrita del handoff:
 * suma `device_offline` + `agent_offline` sobre el total. Si ninguno de los dos
 * códigos aparece (p.ej. una vista ya filtrada por otra clase), no se renderiza
 * nada en vez de forzar una frase que no aplica. */
function ConnectivityConclusion({ byCode, total }: { byCode: AlertSummary['byCode']; total: number }) {
  const offline = byCode.filter((r) => r.code === 'device_offline' || r.code === 'agent_offline').reduce((a, r) => a + r.count, 0);
  if (offline === 0 || total === 0) return null;
  const pct = Math.round((offline / total) * 100);
  return (
    <div className="mt-3 font-sans text-[11.5px] leading-[1.5] text-ink-400">
      El <strong className="font-semibold text-brand-severe">{pct}%</strong> son equipos o agentes sin señal: es un problema de conectividad, no de {fmt(total)} fallas distintas.
    </div>
  );
}

interface Props {
  byCode: AlertSummary['byCode'];
  total: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

function PanelHeader({ total, loading, error }: Pick<Props, 'total' | 'loading' | 'error'>) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-150 px-5 py-[14px]">
      <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">SIN RESOLVER POR CÓDIGO</span>
      {!loading && !error && <span className="font-sans text-[11.5px] text-ink-300">{fmt(total)} en total</span>}
    </div>
  );
}

const MAX_CODES = 6;

/** Sólo los 6 códigos más frecuentes: el panel comparte fila con las métricas
 * y con 11+ códigos se comía el alto de la tabla (rediseño sin scroll,
 * 27/08/2026). Dos columnas en xl+ (6 códigos en 3 filas), así el panel queda
 * a la altura del 2×2 de métricas de al lado en vez de estirarlo. */
function CodeList({ byCode, total }: Pick<Props, 'byCode' | 'total'>) {
  const max = byCode[0]?.count ?? 0;
  const shown = byCode.slice(0, MAX_CODES);
  const hidden = byCode.length - shown.length;
  return (
    <>
      <div className="grid grid-cols-1 gap-x-6 [&>*:last-child]:border-b-0 xl:grid-cols-2 xl:[&>*:nth-last-child(-n+2)]:border-b-0">
        {shown.map((row, i) => <CodeRow key={row.code} row={row} index={i} max={max} total={total} />)}
      </div>
      {hidden > 0 && <div className="mt-2 font-sans text-[11.5px] text-ink-300">y {hidden} código{hidden === 1 ? '' : 's'} más con menos alertas</div>}
    </>
  );
}

function PanelBody({ byCode, total, loading, error, onRetry }: Props) {
  if (error) return <CardError onRetry={onRetry} />;
  if (loading) return <div className="h-[120px] animate-pulse rounded bg-surface-track" />;
  if (byCode.length === 0) return <div className="py-6 text-center font-sans text-[12.5px] text-ink-300">Sin alertas sin resolver</div>;
  return (
    <>
      <CodeList byCode={byCode} total={total} />
      <ConnectivityConclusion byCode={byCode} total={total} />
    </>
  );
}

/** "Sin resolver por código" (handoff hifi #3, 26/08/2026) — el cambio de mayor
 * valor de la pantalla: convierte 2.249 filas en ~4 problemas reales. `byCode`
 * viene ya agregado en servidor (`GET /alerts/summary`, `device_offline`/
 * `agent_offline` desagregados de `availability`). */
export default function AlertsByCodePanel(props: Props) {
  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 border-t-[3px] border-t-brand-severe bg-white">
      <PanelHeader {...props} />
      <div className="px-5 pb-4 pt-3"><PanelBody {...props} /></div>
    </div>
  );
}
