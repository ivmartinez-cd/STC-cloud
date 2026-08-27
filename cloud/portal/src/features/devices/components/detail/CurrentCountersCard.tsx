import { Card, CardTitle, Row } from './primitives';
import { fmtDateTime } from './format';
import { fmtInt } from '../../../../shared/lib/supplies';
import type { DetailedCounters } from '../../../../shared/types/monitor';
import type { DeviceDetailData, Reading } from '../../types/deviceDetailPage';

/** "Contadores actuales" (handoff hifi "Dispositivo — detalle") — total +
 * barra apilada mono/color + desglose por función (cuando el equipo lo
 * reporta) + aviso de confiabilidad de lectura si el método es SNMP. */
export default function CurrentCountersCard({ device, latest, totalPages, monoPages, colorPages, counters }: {
  device: DeviceDetailData; latest: Reading | null; totalPages: number | null; monoPages: number | null; colorPages: number | null; counters: DetailedCounters | undefined;
}) {
  const total = totalPages ?? 0;
  const monoPct = total > 0 ? Math.round(((monoPages ?? 0) / total) * 1000) / 10 : 0;
  const colorPct = total > 0 ? Math.round(((colorPages ?? 0) / total) * 1000) / 10 : 0;
  const reliable = device.poll_method === 'snmp';

  return (
    <Card>
      <CardTitle right={<span className="font-sans text-[11.5px] text-ink-300">{fmtDateTime(latest?.time ?? device.last_seen)}</span>}>Contadores actuales</CardTitle>
      <div className="px-5 pb-3.5 pt-3.5">
        <div className="mb-[18px] flex items-baseline gap-2.5">
          <span className="font-montserrat text-[34px] font-extrabold short:text-[26px] leading-none tracking-[-.02em] tabular-nums text-ink-900">{fmtInt(totalPages)}</span>
          <span className="font-sans text-[12.5px] text-ink-100">páginas totales</span>
        </div>
        <div className="mb-4 flex h-2 overflow-hidden rounded-[4px]">
          <div className="bg-brand-gray" style={{ width: `${monoPct}%` }} />
          <div className="bg-brand" style={{ width: `${colorPct}%` }} />
        </div>
        <Row label="Monocromo" value={fmtInt(monoPages)} />
        <Row label="Color" value={fmtInt(colorPages)} />
        {counters?.copy?.total != null && <Row label="Copias" value={fmtInt(counters.copy.total)} />}
        {counters?.scans?.total != null && <Row label="Escaneos" value={fmtInt(counters.scans.total)} />}
        {counters?.duplexEquivalent?.total != null && <Row label="Doble faz" value={fmtInt(counters.duplexEquivalent.total)} />}
        {reliable && (
          <div className="mt-4 flex items-center gap-[11px] rounded-[3px] border border-brand-chip-border bg-brand-soft px-[13px] py-3">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand font-montserrat text-[11px] font-bold text-white">✓</span>
            <div>
              <div className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-brand-accent">Lectura confiable</div>
              <div className="font-sans text-[12px] leading-[1.4] text-ink-800">Equipo vía SNMP · sin saltos de contador</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
