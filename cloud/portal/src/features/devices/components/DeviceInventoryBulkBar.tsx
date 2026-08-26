import BulkActionBar from '../../../shared/components/BulkActionBar';

/** Selección múltiple de la tabla (handoff hifi "Inventario de dispositivos") — las
 * acciones en bloque REALES sobre dispositivos ya existen (`DeviceLifecycleModals`,
 * usadas por `agents`/`pending-devices`); cablearlas acá queda fuera de este alcance
 * (sólo la tabla del inventario global), de ahí el botón stub. */
export default function DeviceInventoryBulkBar({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <BulkActionBar count={count} onClear={onClear}>
      <button
        type="button" disabled title="Acciones en bloque sobre el inventario global: próximamente"
        className="cursor-not-allowed rounded-[3px] border border-line-300 bg-white px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-300"
      >
        Acciones en bloque (próximamente)
      </button>
    </BulkActionBar>
  );
}
