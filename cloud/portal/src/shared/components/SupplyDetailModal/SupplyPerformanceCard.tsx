import type { SupplyCycle } from '../../types/supplyHistory';
import { fmtInt } from '../../lib/supplies';
import { formatDate } from '../../lib/formatters';
import { Card, CardTitle, Row } from './primitives';

function PagesHeadline({ cycle }: { cycle: SupplyCycle }) {
  const total = cycle.total_printed;
  // Sin páginas medidas la barra quedaba naranja de punta a punta, como si
  // todo hubiera sido color: con `total` en null o 0 no se dibuja ninguna.
  const split = total != null && total > 0
    ? Math.round(((cycle.mono_printed ?? 0) / total) * 100)
    : null;
  return (
    <div className="px-5 pb-3.5 pt-4">
      <div className="flex items-baseline gap-2">
        <span className="font-montserrat text-[28px] font-extrabold leading-none tracking-[-.02em] tabular-nums text-ink-900">{fmtInt(total)}</span>
        <span className="font-sans text-[11.5px] text-ink-300">páginas impresas</span>
      </div>
      {split === null ? (
        <p className="mt-2 font-sans text-[11px] text-ink-300">Todavía no se midieron páginas desde que se instaló este consumible.</p>
      ) : (
        <>
          <div className="mt-2.5 flex h-[5px] overflow-hidden rounded-[3px] bg-surface-track">
            <span className="block h-full bg-brand-gray" style={{ width: `${split}%` }} />
            <span className="block h-full flex-1 bg-brand" />
          </div>
          <div className="mt-1.5 flex justify-between font-sans text-[11px] text-ink-300">
            <span>{fmtInt(cycle.mono_printed)} monocromo</span>
            <span>{fmtInt(cycle.color_printed)} color</span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * "Detalles de rendimiento" del SDS — todo medido desde el último REEMPLAZO
 * detectado (salto de nivel hacia arriba), no desde el principio de la serie.
 *
 * Las dos estimaciones de abajo son páginas-por-punto-de-nivel observadas en
 * este ciclo × el nivel actual: por eso pueden no coincidir con las "páginas
 * restantes" de la ficha de identificación, que son las que informa el propio
 * equipo. Son dos medidas distintas y el SDS también las muestra separadas.
 */
export default function SupplyPerformanceCard({ cycle }: { cycle: SupplyCycle }) {
  const hasCycle = cycle.started_at != null;
  return (
    <Card>
      <CardTitle right={
        <span className="font-sans text-[11px] text-ink-300">
          {cycle.days_in_use != null ? `${cycle.days_in_use} días en uso` : 'Sin ciclo medible'}
        </span>
      }>Detalles de rendimiento</CardTitle>
      {hasCycle ? (
        <>
          <PagesHeadline cycle={cycle} />
          <div className="border-t border-line-150 px-5 py-1">
            <Row label="Fecha de lectura inicial" value={formatDate(cycle.started_at)} />
            <Row label="Nivel inicial" value={cycle.initial_level != null ? `${cycle.initial_level}%` : '—'} />
            <Row label="Porcentaje utilizado" value={cycle.used_pct != null ? `${cycle.used_pct}%` : '—'} />
            <Row label="Ciclos al instalar" value={fmtInt(cycle.cycles_at_start)} />
            <Row label="Ciclos en este consumible" value={fmtInt(cycle.cycles_in)} />
            <Row label="Estimación de páginas restantes" value={fmtInt(cycle.est_total_remaining)} />
            <Row label="Estimación a color" value={fmtInt(cycle.est_color_remaining)} />
          </div>
        </>
      ) : (
        <p className="px-5 py-8 text-center font-sans text-[12px] text-ink-300">
          Todavía no hay lecturas suficientes de este consumible para medir un ciclo de uso.
        </p>
      )}
    </Card>
  );
}
