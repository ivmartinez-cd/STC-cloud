import { Link } from 'react-router-dom';
import { fmt } from '../../../shared/lib/formatters';
import { initialsOf } from './deviceDirectoryFormat';
import type { DeviceDirectoryGroup } from '../types/deviceDirectory';

/** Encabezado de grupo por cliente (handoff hifi "Inventario de dispositivos") — cada
 * cluster de filas contiguas de la página que comparten `client_id` (ver docblock de
 * `listDeviceDirectory` en el backend). */
export default function DeviceGroupHeaderRow({ group }: { group: DeviceDirectoryGroup }) {
  const meta = `${fmt(group.device_count_total)} dispositivos · ${fmt(group.device_count_in_view)} en esta vista · ${fmt(group.open_alerts_count)} alertas abiertas`;
  return (
    <div className="flex items-center gap-3 border-b border-line-150 bg-surface-table-head px-5 py-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-brand-chip-border bg-brand-soft font-montserrat text-[9.5px] font-bold text-brand-accent">{initialsOf(group.name)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-montserrat text-[11px] font-bold uppercase tracking-[.06em] text-ink-900">{group.name}</div>
        <div className="truncate font-sans text-[11px] text-ink-300">{meta}</div>
      </div>
      <Link to={`/clients/${group.id}`} className="whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent transition-colors duration-150 ease-in-out hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">VER CLIENTE →</Link>
    </div>
  );
}
