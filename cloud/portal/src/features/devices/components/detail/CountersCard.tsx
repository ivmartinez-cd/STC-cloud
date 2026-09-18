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
  isColor = true,
  counters,
}: {
  device: DeviceDetailData | null;
  latest: Reading | null;
  totalPages: number | null;
  monoPages: number | null;
  colorPages: number | null;
  isColor?: boolean;
  counters: DetailedCounters | undefined;
}) {
  return (
    <Card>
      <CardTitle>Últimos recuentos de páginas</CardTitle>
      <div className="px-5 pb-[18px] pt-2">
        {isColor && <Row label="Páginas monocromáticas" value={fmtInt(monoPages)} />}
        {isColor && <Row label="Páginas a color" value={fmtInt(colorPages)} />}
        <Row label="Número total de páginas" value={<span className="font-montserrat font-bold text-brand-accent">{fmtInt(totalPages)}</span>} />
        {counters?.equivalentA4 && (isColor ? <TripleRows label="Equivalente A4" t={counters.equivalentA4} /> : <Row label="Equivalente A4" value={fmtInt(counters.equivalentA4.total)} />)}
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
