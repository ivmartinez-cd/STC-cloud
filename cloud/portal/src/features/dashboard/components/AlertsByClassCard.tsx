import { Link } from 'react-router-dom';
import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import MiniBar from './MiniBar';
import { fmt } from '../../../shared/lib/formatters';

type AlertRow = NonNullable<DashboardData['alertsByClass']>[number];

// Paleta sólo institucional (naranja + grises — README): severidad se
// resuelve con tono, nunca con rojo/verde. Mismo agrupamiento semántico que
// tenía la versión anterior (crítico / atención / informativo / disponible),
// re-mapeado a los tonos que pide el handoff hifi. Las clases realmente
// críticas usan el mismo `--color-severity-critical` que colas y presencia
// de monitores (misma escala en todo el panel); "atención" se queda un
// escalón más claro (`brand-light`) para no perder la distinción con
// "crítico" — colapsarlas en un solo tono de advertencia sería MENOS
// granular que lo que ya había, no más.
const CLASS_COLOR: Record<string, string> = {
  availability: 'var(--color-brand)',
  system_change: 'var(--color-brand-gray)',
  consumable_out: 'var(--color-severity-critical)',
  system_failure: 'var(--color-severity-critical)',
  jam: 'var(--color-severity-critical)',
  subunit_out: 'var(--color-severity-critical)',
  media_out: 'var(--color-severity-critical)',
  consumable_low: 'var(--color-brand-light)',
  system_warning: 'var(--color-brand-light)',
  user_action: 'var(--color-brand-light)',
  subunit_low: 'var(--color-brand-light)',
  media_low: 'var(--color-brand-light)',
  information: 'var(--color-ink-500)',
  other: 'var(--color-ink-500)',
};

function classColor(alertClass: string): string {
  return CLASS_COLOR[alertClass] ?? 'var(--color-ink-500)';
}

function Row({ row, max }: { row: AlertRow; max: number }) {
  const pct = Math.max(1.2, max > 0 ? (row.count / max) * 100 : 0);
  return (
    <Link
      to={`/alerts?class=${row.alert_class}&resolved=false`}
      className="grid grid-cols-[8px_158px_1fr_50px] items-center gap-[11px] border-b border-line-200 py-2 transition-colors duration-[120ms] ease-in-out hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      <span className="block h-[7px] w-[7px] rounded-full" style={{ background: classColor(row.alert_class) }} />
      <span className="truncate font-sans text-[12.5px] leading-[1.2] text-ink-700">{row.label}</span>
      <span className="block h-1.5 rounded-[3px] bg-surface-track">
        <span className="block h-full rounded-[3px]" style={{ width: `${pct}%`, background: classColor(row.alert_class) }} />
      </span>
      <span className="text-right font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-900">{fmt(row.count)}</span>
    </Link>
  );
}

function RowSkeleton({ i }: { i: number }) {
  return (
    <div className="grid grid-cols-[8px_158px_1fr_50px] items-center gap-[11px] border-b border-line-200 py-2">
      <SkeletonBlock heightPx={7} widthPct={100} className="rounded-full" />
      <SkeletonBlock heightPx={10} widthPct={70 - (i % 3) * 8} />
      <MiniBar pct={0} height={6} radius={3} />
      <SkeletonBlock heightPx={10} widthPct={80} className="ml-auto" />
    </div>
  );
}

/** "Alertas actuales por clase" del handoff hifi: dos columnas de filas
 * ordenadas de mayor a menor, barra escalada sobre el máximo, punto de color
 * institucional por clase. Reemplaza la tabla horizontal anterior. */
export default function AlertsByClassCard({
  alertsByClass, loading, error, onRetry,
}: {
  alertsByClass: DashboardData['alertsByClass'] | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = [...(alertsByClass ?? [])].sort((a, b) => b.count - a.count);
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const max = rows[0]?.count ?? 0;
  const half = Math.ceil(rows.length / 2);
  const colA = rows.slice(0, half);
  const colB = rows.slice(half);

  return (
    <SdsPanel
      title="Alertas actuales por clase"
      headerRight={
        !loading && !error ? (
          <span className="flex items-baseline gap-2">
            <span className="font-sans text-[11px] text-ink-300">TOTAL</span>
            <span className="font-montserrat text-[15px] font-bold tabular-nums text-brand-severe">{fmt(total)}</span>
          </span>
        ) : undefined
      }
    >
      <div className="px-5 pb-4 pt-3">
        {error ? (
          <CardError onRetry={onRetry} />
        ) : loading ? (
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <div>{Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} i={i} />)}</div>
            <div>{Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} i={i} />)}</div>
          </div>
        ) : rows.length === 0 ? (
          <CardEmpty />
        ) : (
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <div>{colA.map((r) => <Row key={r.alert_class} row={r} max={max} />)}</div>
            <div>{colB.map((r) => <Row key={r.alert_class} row={r} max={max} />)}</div>
          </div>
        )}
      </div>
    </SdsPanel>
  );
}
