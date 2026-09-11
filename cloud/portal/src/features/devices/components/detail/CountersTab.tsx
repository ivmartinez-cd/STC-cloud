import { Cpu, Copy, ScanLine, Phone } from 'lucide-react';
import { Card, CardTitle, Row, TripleRows } from './primitives';
import CountersCard from './CountersCard';
import { fmtInt } from '../../../../shared/lib/supplies';
import type { DetailedCounters } from '../../../../shared/types/monitor';
import type { DeviceDetailData, Reading } from '../../types/deviceDetailPage';

export default function CountersTab({
  device,
  latest,
  totalPages,
  monoPages,
  colorPages,
  counters,
}: {
  device: DeviceDetailData;
  latest: Reading | null;
  totalPages: number | null;
  monoPages: number | null;
  colorPages: number | null;
  counters: DetailedCounters | undefined;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      <CountersCard device={device} latest={latest} totalPages={totalPages} monoPages={monoPages} colorPages={colorPages} counters={counters} />
      <Card>
        <CardTitle icon={<Cpu size={16} />}>Desglose por función</CardTitle>
        {counters ? (
          <div className="px-5 pb-[18px] pt-2">
            <TripleRows label="Impresión" t={counters.print} />
            <TripleRows label="Copia" t={counters.copy} />
            <TripleRows label="Fax" t={counters.fax} />
            <TripleRows label="Dúplex (equiv.)" t={counters.duplexEquivalent} />
            {counters.scans && (
              <>
                <Row label="Escaneos — copia" value={<span className="inline-flex items-center gap-1"><Copy size={11} />{fmtInt(counters.scans.copy)}</span>} />
                <Row label="Escaneos — envío digital" value={<span className="inline-flex items-center gap-1"><ScanLine size={11} />{fmtInt(counters.scans.send)}</span>} />
                <Row label="Escaneos — fax" value={<span className="inline-flex items-center gap-1"><Phone size={11} />{fmtInt(counters.scans.fax)}</span>} />
                <Row label="Escaneos — total" value={fmtInt(counters.scans.total)} />
              </>
            )}
            {counters.monoSimplex && <Row label="Mono símplex (print/report/total)" value={`${fmtInt(counters.monoSimplex.print)} / ${fmtInt(counters.monoSimplex.report)} / ${fmtInt(counters.monoSimplex.total)}`} />}
            {counters.duplex && <Row label="Dúplex (print/report/total)" value={`${fmtInt(counters.duplex.print)} / ${fmtInt(counters.duplex.report)} / ${fmtInt(counters.duplex.total)}`} />}
            {counters.colorEngineCycles != null && <Row label="Ciclos del motor en color" value={fmtInt(counters.colorEngineCycles)} />}
          </div>
        ) : (
          <p className="px-4 py-4 font-sans text-[12.5px] text-ink-300">El equipo no expone desglose de contadores por función (sólo total/mono/color).</p>
        )}
      </Card>
    </div>
  );
}
