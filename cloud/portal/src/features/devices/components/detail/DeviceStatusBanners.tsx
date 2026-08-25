import { Link } from 'react-router-dom';
import { GitMerge, Archive, Tag } from 'lucide-react';
import { MONITOR_STATE_LABELS } from '../../../../shared/lib/constants';
import { fmtDateTime } from './format';
import type { DeviceDetailData } from '../../types/deviceDetailPage';

export default function DeviceStatusBanners({ device }: { device: DeviceDetailData }) {
  return (
    <>
      {device.merged_into && (
        <div className="flex items-center gap-2 rounded-[5px] border border-line-100 bg-surface-avatar px-5 py-3 font-sans text-[12.5px] text-ink-700">
          <GitMerge size={15} className="text-ink-300" />
          Este registro fue fusionado con otro equipo{device.merged_into_serial ? ` (serial ${device.merged_into_serial})` : ''}.
          <Link to={`/devices/${device.merged_into}`} className="font-semibold text-brand-accent hover:underline">Ver el equipo superviviente →</Link>
        </div>
      )}
      {device.decommissioned_at && !device.merged_into && (
        <div className="flex items-center gap-2 rounded-[5px] border border-brand-chip-border bg-brand-soft px-5 py-3 font-sans text-[12.5px] text-brand-accent">
          <Archive size={15} />
          Equipo dado de baja el {fmtDateTime(device.decommissioned_at)}
          {device.decommission_reason ? ` — ${device.decommission_reason}` : ''}.
        </div>
      )}
      {device.monitor_state && device.monitor_state !== 'full' && !device.merged_into && (
        <div className="flex items-center gap-2 rounded-[5px] border border-line-100 bg-surface-avatar px-5 py-3 font-sans text-[12.5px] text-ink-700">
          <Tag size={15} className="text-ink-300" />
          Estado de monitoreo: {MONITOR_STATE_LABELS[device.monitor_state]}
          {device.monitor_state === 'disabled' && ' — no se generan lecturas ni alertas para este equipo.'}
          {device.monitor_state === 'reports_only' && ' — factura, pero no genera alertas.'}
          {device.monitor_state === 'supplies_only' && ' — genera alertas, pero no factura.'}
          {device.monitor_state_reason ? ` (${device.monitor_state_reason})` : ''}
        </div>
      )}
    </>
  );
}
