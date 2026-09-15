import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import SdsPanel from './SdsPanel';
import CardError from '../../../shared/components/CardError';
import SkeletonBlock from './Skeleton';
import { fmt } from '../../../shared/lib/formatters';

export type QueueSeverity = 'critical' | 'warning' | 'ok';

const SEVERITY_COLOR: Record<QueueSeverity, string> = {
  critical: 'text-severity-critical',
  warning: 'text-severity-warning',
  ok: 'text-ink-400',
};

export interface QueueItem {
  key: string;
  label: string;
  meta: string;
  value: number;
  severity: QueueSeverity;
  to?: string;
}

function Row({ item }: { item: QueueItem }) {
  const inner = (
    <>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-sans text-[13px] leading-[1.2] text-ink-700">{item.label}</span>
        <span className="font-sans text-[11px] text-ink-300">{item.meta}</span>
      </div>
      <span className={`shrink-0 font-montserrat text-[18px] font-bold leading-none tabular-nums ${SEVERITY_COLOR[item.severity]}`}>{fmt(item.value)}</span>
    </>
  );
  const className = 'flex items-center justify-between gap-3 border-b border-line-200 py-[9px] last:border-b-0';
  return item.to ? (
    <Link to={item.to} className={`${className} transition-colors duration-[120ms] ease-in-out hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2`}>{inner}</Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-200 py-[9px] last:border-b-0">
      <div className="flex flex-1 flex-col gap-1.5">
        <SkeletonBlock heightPx={12} widthPct={55} />
        <SkeletonBlock heightPx={10} widthPct={35} />
      </div>
      <SkeletonBlock heightPx={18} style={{ width: 40 }} />
    </div>
  );
}

/** "Cola de trabajo" del rediseño "V1 Compacta" (handoff 14/09/2026):
 * consolida en una sola tarjeta lo que antes eran hasta 4 `CounterPanel`
 * sueltos (dispositivos pendientes, consumibles, incidencias) — cada fila
 * es la cifra principal nada más; el desglose completo vive en el destino
 * al que enlaza. */
export default function WorkQueueCard({
  items, loading, error, onRetry, headerRight, className = '',
}: {
  items: QueueItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  headerRight?: ReactNode;
  className?: string;
}) {
  return (
    <SdsPanel title="Cola de trabajo" headerClassName="px-[18px] py-[14px]" headerRight={headerRight} className={className}>
      <div className="px-[18px] pb-1 pt-1">
        {error ? (
          <CardError onRetry={onRetry} className="py-4" />
        ) : loading ? (
          Array.from({ length: items.length || 4 }, (_, i) => <RowSkeleton key={i} />)
        ) : (
          items.map((item) => <Row key={item.key} item={item} />)
        )}
      </div>
    </SdsPanel>
  );
}
