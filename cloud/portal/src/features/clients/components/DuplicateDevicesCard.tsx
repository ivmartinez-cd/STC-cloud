import { useState } from 'react';
import { useDuplicateDevices } from '../hooks/useDuplicateDevices';
import ResolveDuplicateModal from './ResolveDuplicateModal';
import HifiPagination from '../../../shared/components/HifiPagination';
import { describeDuplicateMatch } from '../../../shared/lib/duplicateReasons';
import type { DuplicateCandidate } from '../types/clientDetail';

/** 4 pares por página: la tarjeta comparte columna con "Monitores instalados"
 * en la zona "Requiere atención" — una lista larga acá empujaba todo el resto
 * del resumen fuera de la pantalla (auditoría 27/08/2026). Con la heurística
 * corregida del backend lo normal es que haya 0-2 pares reales. */
const PAGE_SIZE = 4;

function pairLabel(c: DuplicateCandidate): { a: string; b: string } {
  const of = (brand: string | null, model: string | null, name: string | null, serial: string | null) =>
    name || [brand, model].filter(Boolean).join(' ') || serial || '—';
  return { a: of(c.a_brand, c.a_model, c.a_name, c.a_serial), b: of(c.b_brand, c.b_model, c.b_name, c.b_serial) };
}

/** "serie BRBSM6S4XV ↔ serie Z5MABJIC70000BY" — cuando los dos lados se llaman
 * igual (mismo hostname, mismo modelo) el nombre solo no distingue nada. */
function sideDetail(serial: string | null, ip: string | null): string {
  return serial ? `serie ${serial}` : ip ? `IP ${ip}` : 'sin serie';
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
    <div className="grid grid-cols-[1fr_110px_96px] items-center gap-3.5 border-b border-line-200 py-[11px] last:border-0">
      <div className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{a} <span className="text-ink-300">↔</span> {b}</div>
        <div className="truncate font-sans text-[11px] text-ink-300">
          {describeDuplicateMatch(candidate)} · {sideDetail(candidate.a_serial, candidate.a_ip)} ↔ {sideDetail(candidate.b_serial, candidate.b_ip)}
        </div>
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
  const [page, setPage] = useState(0);

  if (!loading && candidates.length === 0) return null;

  const totalPages = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = candidates.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 border-t-[3px] border-t-brand-severe bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-150 px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Duplicados sin resolver</span>
        <span className="font-sans text-[11.5px] text-ink-300">
          {loading ? '…' : `${candidates.length} ${candidates.length === 1 ? 'par detectado' : 'pares detectados'}`}
        </span>
      </div>
      <div className="px-5 pb-1.5 pt-1.5">
        {loading ? (
          <div className="space-y-3 py-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-[42px] animate-pulse rounded bg-surface-track" />)}
          </div>
        ) : (
          visible.map((c) => <Row key={`${c.a_id}-${c.b_id}`} candidate={c} onResolve={() => setResolving(c)} />)
        )}
      </div>
      {!loading && candidates.length > PAGE_SIZE && (
        <HifiPagination page={safePage} totalPages={totalPages} total={candidates.length} pageSize={PAGE_SIZE} itemLabel="pares" onPageChange={setPage} />
      )}
      {resolving && (
        <ResolveDuplicateModal isOpen pair={resolving} onClose={() => setResolving(null)} onDone={refetch} />
      )}
    </div>
  );
}
