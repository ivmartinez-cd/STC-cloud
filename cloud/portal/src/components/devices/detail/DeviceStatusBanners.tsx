import { Link } from 'react-router-dom';
import { GitMerge, Archive, Tag } from 'lucide-react';
import { MONITOR_STATE_LABELS } from '../../../lib/constants';
import { fmtDateTime } from './format';
import type { DeviceDetailData } from '../../../types/deviceDetailPage';

export default function DeviceStatusBanners({ device }: { device: DeviceDetailData }) {
  return (
    <>
      {device.merged_into && (
        <div className="flex items-center gap-2 bg-slate-100 border border-slate-300 rounded-2xl px-5 py-3 text-xs font-bold text-slate-600">
          <GitMerge size={16} />
          Este registro fue fusionado con otro equipo{device.merged_into_serial ? ` (serial ${device.merged_into_serial})` : ''}.
          <Link to={`/devices/${device.merged_into}`} className="text-brand-hover hover:underline">Ver el equipo superviviente →</Link>
        </div>
      )}
      {device.decommissioned_at && !device.merged_into && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 text-xs font-bold text-amber-800">
          <Archive size={16} />
          Equipo dado de baja el {fmtDateTime(device.decommissioned_at)}
          {device.decommission_reason ? ` — ${device.decommission_reason}` : ''}.
        </div>
      )}
      {device.monitor_state && device.monitor_state !== 'full' && !device.merged_into && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3 text-xs font-bold text-blue-800">
          <Tag size={16} />
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
