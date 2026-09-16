import { Link } from 'react-router-dom';
import type { AlertHotspot, AlertHotspots, HotspotKind } from '../../../shared/types/monitor';
import Panel, { PanelFoot } from './Panel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import { fmt, fmtPct } from '../../../shared/lib/formatters';
import { severityMix, TIER_COLOR } from '../lib/alert-tiers';

const TABS: Array<{ key: HotspotKind; label: string }> = [
  { key: 'device', label: 'Dispositivos' },
  { key: 'client', label: 'Cuentas' },
];

const ACTION = 'font-montserrat text-[10px] font-semibold uppercase tracking-[.1em] text-brand-accent';

/** Toggle segmentado de la cabecera: un solo borde y el activo en tinta llena. */
function Tabs({ active, onChange }: { active: HotspotKind; onChange: (k: HotspotKind) => void }) {
  return (
    <span className="flex border border-line-100">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-pressed={t.key === active}
          className={`px-2.5 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-[.1em] transition-colors duration-[120ms] ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
            t.key === active ? 'bg-ink-900 text-white' : 'bg-white text-ink-400 hover:text-ink-900'
          }`}
        >
          {t.label}
        </button>
      ))}
    </span>
  );
}

/** Mezcla de severidad de la fila: tres cuadrados repartidos por proporción. */
function Mix({ byClass }: { byClass: Record<string, number> }) {
  return (
    <span className="flex shrink-0 items-center gap-[3px]" aria-hidden="true">
      {severityMix(byClass).map((tier, i) => (
        <span key={i} className="block h-1.5 w-1.5" style={{ background: TIER_COLOR[tier] }} />
      ))}
    </span>
  );
}

function Row({ item, action }: { item: AlertHotspot; action: string }) {
  return (
    <Link
      to={item.href}
      className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line-200 py-2.5 transition-colors duration-[120ms] ease-in-out hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      <span className="min-w-0 flex-[1_1_200px]">
        <span className="block truncate font-sans text-[13px] leading-[1.2] text-ink-900">{item.name}</span>
        <span className="mt-0.5 block truncate font-sans text-[11px] text-ink-400">{item.meta}</span>
      </span>
      <Mix byClass={item.byClass} />
      <span className="shrink-0 basis-[34px] text-right font-mono text-[15px] tabular-nums text-ink-900">{fmt(item.count)}</span>
      <span className={`${ACTION} shrink-0`}>{action} ›</span>
    </Link>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-line-200 py-2.5">
      <div className="flex flex-1 flex-col gap-1.5"><SkeletonBlock heightPx={12} widthPct={55} /><SkeletonBlock heightPx={10} widthPct={35} /></div>
      <SkeletonBlock heightPx={14} style={{ width: 34 }} />
    </div>
  );
}

/** Pie: qué tajada del total concentran las filas que se están viendo. */
function Foot({ data }: { data: AlertHotspots }) {
  const shown = data.items.reduce((a, i) => a + i.count, 0);
  const noun = data.by === 'device' ? 'equipos' : 'cuentas';
  return (
    <PanelFoot>
      {fmt(data.items.length)} {noun} de {fmt(data.universe)} concentran {fmt(shown)} de {fmt(data.total)} alertas
      {' '}(<span className="text-brand-accent">{fmtPct(shown, data.total)}</span>) · sólo alertas con equipo asociado
    </PanelFoot>
  );
}

/**
 * "Dónde se concentran las alertas" (handoff "Panel de control", 16/09/2026).
 * El panel que el rediseño anterior no tenía: el número grande dice cuántas
 * alertas hay, éste dice DÓNDE están y deja la acción a un clic.
 *
 * Cada fila es un `<Link>` al listado de alertas ya filtrado por ese equipo o
 * esa cuenta — patrón obligatorio del portal desde la auditoría de navegación
 * del 12/09/2026: nada de filas que obliguen a re-filtrar a mano en el destino.
 *
 * La acción por fila es la del handoff pero derivada del dato, no fija: si la
 * alerta que domina el equipo es de consumible, el verbo es "Reponer".
 */
export default function HotspotsPanel({ data, by, onChangeTab, loading, error, onRetry }: {
  data: AlertHotspots | null;
  by: HotspotKind;
  onChangeTab: (k: HotspotKind) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const items = data?.items ?? [];
  return (
    <Panel title="Dónde se concentran las alertas" right={<Tabs active={by} onChange={onChangeTab} />}>
      {error ? (
        <CardError onRetry={onRetry} />
      ) : loading && items.length === 0 ? (
        Array.from({ length: 5 }, (_, i) => <RowSkeleton key={i} />)
      ) : items.length === 0 ? (
        <CardEmpty text="Sin alertas activas" />
      ) : (
        <>
          {items.map((item) => <Row key={item.id} item={item} action={actionFor(by, item)} />)}
          {data && <Foot data={data} />}
        </>
      )}
    </Panel>
  );
}

/** Verbo de la fila: reponer si lo que domina es consumible, si no ver alertas. */
function actionFor(by: HotspotKind, item: AlertHotspot): string {
  if (by === 'client') return 'Abrir cuenta';
  const supply = (item.byClass.consumable_out ?? 0) + (item.byClass.consumable_low ?? 0);
  return supply > item.count / 2 ? 'Reponer' : 'Ver alertas';
}
