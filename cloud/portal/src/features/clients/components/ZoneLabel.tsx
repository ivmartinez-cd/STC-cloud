/** Rótulo de zona (handoff hifi "Cliente — detalle", 25/08/2026): línea 20×2px +
 * label — "REQUIERE ATENCIÓN" (`#C6710A`), "CONFIGURACIÓN DE LA CUENTA" (`#58595B`),
 * "INFRAESTRUCTURA DE MONITOREO · N DISPOSITIVOS" (`#F7941D`). */
export default function ZoneLabel({ text, lineColorClass }: { text: string; lineColorClass: string }) {
  return (
    <div className="flex items-center gap-[11px]">
      <span className={`block h-0.5 w-5 ${lineColorClass}`} />
      <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-550">{text}</span>
    </div>
  );
}
