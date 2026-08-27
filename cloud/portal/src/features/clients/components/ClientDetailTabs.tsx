import type { ClientDetailTab } from '../types/clientDetail';

const TABS: Array<{ id: ClientDetailTab; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'dispositivos', label: 'Dispositivos' },
  { id: 'alertas', label: 'Alertas' },
  { id: 'consumibles', label: 'Consumibles' },
  { id: 'configuracion', label: 'Configuración' },
];

/** Tabs del detalle de cliente (handoff hifi "Cliente — detalle", 25/08/2026) — cambian
 * el contenido bajo la tarjeta de identidad; el header y la tira de métricas persisten
 * (README). "Resumen" es el único documentado en detalle; el resto reusa la tabla/
 * tarjetas correspondientes a pantalla completa (ver `ClientDetail.tsx`). */
export default function ClientDetailTabs({ active, onChange }: { active: ClientDetailTab; onChange: (tab: ClientDetailTab) => void }) {
  return (
    <div role="tablist" className="flex gap-6 border-t border-line-150 px-6">
      {TABS.map((t) => {
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
