import { brandBadge } from '../lib/identity';

/** Badge de marca 30×30 (handoff hifi #3, 26/08/2026) — markup idéntico a las
 * 4 copias en `DeviceDirectoryRow.tsx`, `DeviceInventoryTable.tsx`,
 * `ClientDevicesTable.tsx`, `PendingQueueRow.tsx`. */
export default function BrandBadge({ brand }: { brand: string | null }) {
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] border border-line-avatar bg-surface-avatar font-montserrat text-[9px] font-bold text-ink-400">
      {brandBadge(brand)}
    </span>
  );
}
