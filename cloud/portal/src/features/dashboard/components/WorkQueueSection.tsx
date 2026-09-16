import { Link } from 'react-router-dom';
import Panel, { PanelMeta } from './Panel';
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
  /** Verbo de la fila ("Procesar", "Dar de alta"): qué se hace con esta cola. */
  action: string;
  to?: string;
}

const ROW = 'flex items-center justify-between gap-4 border-b border-line-200 py-2.5';

function Row({ item }: { item: QueueItem }) {
  // Una cola en cero no ofrece acción de color: no hay nada que atender, y el
  // link en naranja invitaría a entrar a una lista vacía.
  const idle = item.value === 0;
  const inner = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-sans text-[13px] leading-[1.2] text-ink-900">{item.label}</span>
        <span className="mt-0.5 block truncate font-sans text-[11px] text-ink-400">{item.meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className={`font-montserrat text-[10px] font-semibold uppercase tracking-[.1em] ${idle ? 'text-ink-400' : 'text-brand-accent'}`}>
          {item.action}
        </span>
        <span className={`font-mono text-[17px] leading-none tabular-nums ${SEVERITY_COLOR[item.severity]}`}>{fmt(item.value)}</span>
      </span>
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
        <SkeletonBlock heightPx={12} widthPct={45} />
        <SkeletonBlock heightPx={10} widthPct={28} />
      </div>
      <SkeletonBlock heightPx={17} style={{ width: 34 }} />
    </div>
  );
}

/**
 * "Cola de trabajo" (handoff "Panel de control", 16/09/2026): una fila por
 * cola, ordenada por urgencia, con el VERBO explícito de cada una — la
 * diferencia con el rediseño anterior, que mostraba el número pero no decía
 * qué se hace con él.
 *
 * Cada fila navega a su listado filtrado; el desglose completo vive en el
 * destino, no acá. "Dispositivos sin alta" no tiene destino propio todavía
 * (no hay pantalla que liste sólo los `monitor_state = 'disabled'`), así que
 * esa fila es texto: mejor que un link a un inventario sin filtrar.
 */
export default function WorkQueueSection({ items, loading, error, onRetry }: {
  items: QueueItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const pending = items.reduce((acc, i) => acc + i.value, 0);
  return (
    <Panel
      title="Cola de trabajo"
      right={!loading && !error && <PanelMeta>{fmt(pending)} pendientes</PanelMeta>}
    >
      {error ? (
        <CardError onRetry={onRetry} />
      ) : loading ? (
        Array.from({ length: items.length || 4 }, (_, i) => <RowSkeleton key={i} />)
      ) : (
        items.map((item) => <Row key={item.key} item={item} />)
      )}
    </Panel>
  );
}
