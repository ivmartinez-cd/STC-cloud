interface TabDef<T extends string> { id: T; label: string }

/** Tabs de una pantalla de detalle (handoff hifi "Monitor — detalle", 25/08/2026) —
 * cambian el contenido bajo la tarjeta de identidad; header y tira de métricas
 * persisten. Genérico: reusado por Monitor y Dispositivo detalle. */
export default function DetailTabs<T extends string>({ tabs, active, onChange }: {
  tabs: Array<TabDef<T>>;
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-6 border-t border-line-150 px-6">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`border-b-2 py-[14px] short:py-2.5 font-sans text-[12.5px] font-semibold transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
              isActive ? 'border-brand text-ink-900' : 'border-transparent text-ink-550 hover:text-ink-600'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
