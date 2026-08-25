import { useState } from 'react';
import { useDuplicateDevices } from '../hooks/useDuplicateDevices';
import ResolveDuplicateModal from './ResolveDuplicateModal';
import type { DuplicateCandidate } from '../types/clientDetail';

const REASON_LABEL: Record<string, string> = {
  same_mac: 'misma MAC',
  ghost_same_ip: 'fantasma en la misma IP',
  same_serial_different_monitor: 'mismo serial en dos monitores',
  same_hostname: 'mismo hostname',
};

function pairLabel(c: DuplicateCandidate): { a: string; b: string } {
  const of = (brand: string | null, model: string | null, name: string | null, serial: string | null) =>
    name || [brand, model].filter(Boolean).join(' ') || serial || '—';
  return { a: of(c.a_brand, c.a_model, c.a_name, c.a_serial), b: of(c.b_brand, c.b_model, c.b_name, c.b_serial) };
}

function meta(c: DuplicateCandidate): string {
  const id = c.a_serial ?? c.a_ip ?? c.a_mac;
  const reason = REASON_LABEL[c.reason] ?? c.reason;
  return id ? `${reason} · ${id}` : reason;
}

function ageOf(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return 'hace instantes';
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} d`;
}

function Row({ candidate, onResolve }: { candidate: DuplicateCandidate; onResolve: () => void }) {
  const { a, b } = pairLabel(candidate);
  return (
    <div className="grid grid-cols-[1fr_150px_96px] items-center gap-3.5 border-b border-line-200 py-[11px] last:border-0">
      <div className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{a} <span className="text-ink-300">↔</span> {b}</div>
        <div className="truncate font-sans text-[11px] text-ink-300">{meta(candidate)}</div>
      </div>
      <span className="font-sans text-[11.5px] text-ink-400">{ageOf(candidate.detected_at)}</span>
      <button
        type="button"
        onClick={onResolve}
        className="rounded-[3px] bg-brand-soft px-3 py-[7px] text-center font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent transition-colors duration-150 ease-in-out hover:bg-[#FBE9D3]"
      >
        Resolver
      </button>
    </div>
  );
}

/** "Duplicados sin resolver" — tarjeta prioritaria de la zona "Requiere atención"
 * (handoff hifi "Cliente — detalle", 25/08/2026). Sólo admin/operator (herramienta
 * de operaciones, `GET /devices/duplicates` deny-by-default para client_viewer). */
export default function DuplicateDevicesCard({ clientId }: { clientId: string }) {
  const { candidates, loading, refetch } = useDuplicateDevices(clientId, true);
  const [resolving, setResolving] = useState<DuplicateCandidate | null>(null);

  if (!loading && candidates.length === 0) return null;

  return (
    <div className="rounded-[5px] border border-line-100 border-t-[3px] border-t-brand-severe bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-150 px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Duplicados sin resolver</span>
        <span className="font-sans text-[11.5px] text-ink-300">{loading ? '…' : `${candidates.length} pares detectados por número de serie`}</span>
      </div>
      <div className="px-5 pb-3.5 pt-1.5">
        {loading ? (
          <div className="space-y-3 py-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-[42px] animate-pulse rounded bg-surface-track" />)}
          </div>
        ) : (
          candidates.map((c) => <Row key={`${c.a_id}-${c.b_id}`} candidate={c} onResolve={() => setResolving(c)} />)
        )}
      </div>
      {resolving && (
        <ResolveDuplicateModal isOpen pair={resolving} onClose={() => setResolving(null)} onDone={refetch} />
      )}
    </div>
  );
}
