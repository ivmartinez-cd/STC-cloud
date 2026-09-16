import { Link } from 'react-router-dom';
import SectionHead from './SectionHead';
import CardError from '../../../shared/components/CardError';
import SkeletonBlock from './Skeleton';
import { fmt } from '../../../shared/lib/formatters';

export type QueueSeverity = 'critical' | 'warning' | 'ok';

/** El handoff pide dos tonos (acento si hay trabajo pendiente, neutro si no).
 * Conservamos el tercero para lo crítico — una incidencia abierta no se lee
 * igual que 17 solicitudes de consumible, y el rojo ya está en juego en el
 * bloque KPI de arriba. */
const SEVERITY_COLOR: Record<QueueSeverity, string> = {
  critical: 'text-severity-critical',
  warning: 'text-brand-accent',
  ok: 'text-ink-500',
};

export interface QueueItem {
  key: string;
  label: string;
  meta: string;
  value: number;
  severity: QueueSeverity;
  to?: string;
}

const ROW = 'flex items-center justify-between gap-5 border-b border-line-200 py-3.5 short:py-2.5';

function Row({ item }: { item: QueueItem }) {
  const inner = (
    <>
      <span className="min-w-0">
        <span className="block font-sans text-[14px] leading-[1.2] text-ink-900">{item.label}</span>
        <span className="mt-0.5 block font-sans text-[12px] text-ink-400">{item.meta}</span>
      </span>
      <span className={`shrink-0 font-mono text-[20px] leading-none tabular-nums ${SEVERITY_COLOR[item.severity]}`}>{fmt(item.value)}</span>
    </>
  );
  return item.to ? (
    <Link to={item.to} className={`${ROW} transition-colors duration-[120ms] ease-in-out hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2`}>{inner}</Link>
  ) : (
    <div className={ROW}>{inner}</div>
  );
}

function RowSkeleton() {
  return (
    <div className={ROW}>
      <div className="flex flex-1 flex-col gap-1.5">
        <SkeletonBlock heightPx={13} widthPct={30} />
        <SkeletonBlock heightPx={11} widthPct={18} />
      </div>
      <SkeletonBlock heightPx={20} style={{ width: 40 }} />
    </div>
  );
}

/** "Cola de trabajo" del rediseño minimalista (handoff "Panel de control",
 * 16/09/2026): una fila por cola — título, nota y la cifra mono a la derecha,
 * separadas por hairlines. Cada fila navega a su listado filtrado; el
 * desglose completo vive en el destino, no acá. */
export default function WorkQueueSection({
  items, loading, error, onRetry,
}: {
  items: QueueItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section>
      <SectionHead title="Cola de trabajo" />
      {error ? (
        <CardError onRetry={onRetry} />
      ) : loading ? (
        Array.from({ length: items.length || 4 }, (_, i) => <RowSkeleton key={i} />)
      ) : (
        items.map((item) => <Row key={item.key} item={item} />)
      )}
    </section>
  );
}
