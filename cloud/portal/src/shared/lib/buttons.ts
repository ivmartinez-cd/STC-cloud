/** Clases de botón institucionales (handoff hifi #3, 26/08/2026) — hasta ahora
 * declaradas como `const BTN_*` locales, duplicadas en al menos 4 archivos
 * (`DeviceInventoryHeader.tsx`, `PendingQueueHeader.tsx`,
 * `PendingQueueBulkBar.tsx`). Dos tamaños: `_LG` (cabecera de página,
 * `py-[11px] px-[18px]`) y `_SM` (barra de acciones en bloque, `py-2 px-3`).
 * Nunca rojo — `WARNING` es naranja suave, no destructivo. */

export const BTN_PRIMARY_LG = 'rounded-[3px] bg-brand px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

export const BTN_SECONDARY_LG = 'rounded-[3px] border border-line-300 bg-white px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-ink-600 transition-colors duration-150 ease-in-out hover:border-line-hover hover:bg-surface-btn-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

export const BTN_PRIMARY_SM = 'rounded-[3px] bg-brand px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

export const BTN_SECONDARY_SM = 'rounded-[3px] border border-line-300 bg-white px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

export const BTN_WARNING_SM = 'rounded-[3px] border border-brand-chip-border bg-brand-soft px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent transition-colors duration-150 ease-in-out hover:bg-brand-chip-border disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';
