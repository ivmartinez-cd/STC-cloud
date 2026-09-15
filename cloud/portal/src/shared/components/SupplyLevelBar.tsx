/** Barra de nivel de consumible. Por defecto, umbrales (handoff hifi, tokens
 * §7): ≤15% severo, ≤35% atención, resto neutro — usado en listados donde la
 * fila no tiene un color propio (el % ya es el mínimo entre varios tóners).
 * `fillColor` (hex) pisa el umbral cuando la fila SÍ tiene un color real
 * (ej. la tabla de Consumibles del dispositivo, un color por cartucho) — la
 * barra refleja el cartucho, no la urgencia. `—` si el equipo no reportó %.
 * `showValue=false` la deja sin número, para cuando el contenedor ya muestra
 * el porcentaje en grande (modal "Detalles del consumible") y repetirlo al
 * lado quedaba como un "85% 85%".
 * Antes duplicada (`ConsumibleCell`) en `DeviceInventoryTable.tsx`/`ClientDevicesTable.tsx`. */
export default function SupplyLevelBar({ pct, fillColor, showValue = true }: { pct: number | null; fillColor?: string; showValue?: boolean }) {
  if (pct === null) return <span className="font-sans text-[12.5px] text-ink-200">—</span>;
  const colorClass = pct <= 15 ? 'bg-severity-critical' : pct <= 35 ? 'bg-severity-warning' : 'bg-severity-ok';
  const width = Math.max(3, pct);
  return (
    <div className="flex items-center gap-2.5">
      <span className="block h-1.5 flex-1 overflow-hidden rounded-[3px] bg-surface-track">
        <span
          className={`block h-full rounded-[3px] ${fillColor ? '' : colorClass}`}
          style={{ width: `${width}%`, ...(fillColor ? { background: fillColor } : {}) }}
        />
      </span>
      {showValue && <span className="min-w-[30px] text-right font-montserrat text-[11.5px] font-semibold tabular-nums text-ink-100">{pct}%</span>}
    </div>
  );
}
