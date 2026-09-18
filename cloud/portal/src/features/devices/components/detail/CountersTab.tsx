import { Cpu } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import FunctionBreakdown from './FunctionBreakdown';
import CountersCard from './CountersCard';
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
          <FunctionBreakdown counters={counters} />
        ) : (
          <p className="px-4 py-4 font-sans text-[12.5px] text-ink-300">El equipo no expone desglose de contadores por función (sólo total/mono/color).</p>
        )}
      </Card>
    </div>
  );
}
