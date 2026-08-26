import EstadoChip from '../../../shared/components/EstadoChip';

/** "Automatización de datos faltantes" (handoff hifi #3, fase 2, 26/08/2026) —
 * el mockup pide inferir marca/modelo/nivel de consumible de equipos sin
 * lectura SNMP a partir de la serie y el histórico, con 3 cifras reales
 * (417 modelo desconocido / 417 sin nivel / 389 inferibles). Esa inferencia
 * NO EXISTE en el backend en ninguna forma — no hay endpoint, no hay job, no
 * hay ni siquiera la cuenta de "equipos con modelo unknown" en ningún lado.
 * Es una feature de producto completa, no un rediseño — decisión explícita
 * de dejarla fuera de esta fase (mismo criterio que el alcance multi-cliente
 * en Configuración y `SILENCIAR 24 H` en Alertas). La tarjeta queda como
 * placeholder honesto: explica qué haría, sin cifras inventadas ni botón
 * que no hace nada. */
export default function AutomationCard() {
  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-line-150 px-5 py-[14px]">
        <div>
          <div className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">AUTOMATIZACIÓN DE DATOS FALTANTES</div>
          <div className="mt-[5px] font-sans text-[11.5px] text-ink-300">Completa marca, modelo y consumibles de los equipos sin lectura</div>
        </div>
        <EstadoChip label="NO DISPONIBLE" variant="neutral" />
      </div>
      <div className="flex flex-1 flex-col px-5 py-[18px]">
        <p className="font-sans text-[12.5px] leading-[1.55] text-ink-100">
          Cuando un equipo no responde a SNMP, el sistema podría inferir su ficha a partir de la serie y el histórico de
          equipos iguales. Todavía no está construido — no hay job ni endpoint que lo calcule. Antes de activarla hace
          falta un desarrollo aparte, no sólo un cambio de configuración acá.
        </p>
      </div>
    </div>
  );
}
