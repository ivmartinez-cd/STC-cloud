import { FileText } from 'lucide-react';
import { Card, CardTitle, Row, TripleRows } from './primitives';
import { fmtDateTime } from './format';
import { fmtInt } from '../../../../shared/lib/supplies';
import type { DetailedCounters } from '../../../../shared/types/monitor';
import type { DeviceDetailData, Reading } from '../../types/deviceDetailPage';

export default function CountersCard({
  device,
  latest,
  totalPages,
  monoPages,
  colorPages,
  counters,
}: {
  device: DeviceDetailData | null;
  latest: Reading | null;
  totalPages: number | null;
  monoPages: number | null;
  colorPages: number | null;
  counters: DetailedCounters | undefined;
}) {
  return (
    <Card>
      <CardTitle icon={<FileText size={16} />}>Últimos recuentos de páginas</CardTitle>
      <div className="divide-y divide-slate-100">
        <Row label="Páginas monocromáticas" value={fmtInt(monoPages)} />
        <Row label="Páginas a color" value={fmtInt(colorPages)} />
        <Row label="Número total de páginas" value={<span className="text-brand-hover font-black">{fmtInt(totalPages)}</span>} />
        {counters?.equivalentA4 && <TripleRows label="Equivalente A4" t={counters.equivalentA4} />}
        {counters?.print && <Row label="Impresiones" value={fmtInt(counters.print.total)} />}
        {counters?.copy && <Row label="Copias" value={fmtInt(counters.copy.total)} />}
        {counters?.fax && (counters.fax.total ?? 0) > 0 && <Row label="Fax" value={fmtInt(counters.fax.total)} />}
        {counters?.scans && <Row label="Escaneos" value={fmtInt(counters.scans.total)} />}
        {counters?.engineCycles != null && <Row label="Ciclos del motor" value={fmtInt(counters.engineCycles)} />}
        {counters?.totalImpressions && <Row label="Impresiones totales (print/report)" value={`${fmtInt(counters.totalImpressions.print)} / ${fmtInt(counters.totalImpressions.report)}`} />}
        <Row label="Última actualización" value={fmtDateTime(latest?.time ?? device?.last_seen)} muted />
      </div>
    </Card>
  );
}
