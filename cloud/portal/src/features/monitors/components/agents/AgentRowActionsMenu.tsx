import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight, Key, Settings, ShieldOff } from 'lucide-react';
import type { AgentDirectoryRow } from '../../types/agentsDirectory';

function MenuItem({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      className={`flex w-full items-center gap-2 px-3 py-2 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover ${danger ? 'text-brand-severe' : 'text-ink-600'}`}
    >
      {icon} {label}
    </button>
  );
}

/** Reemplaza la columna GESTIÓN (bugs a arreglar: botones `opacity-0
 * group-hover/row:opacity-100`, invisibles hasta hacer hover sobre la fila —
 * lee como vacío). Mismas 3 acciones que el `AgentTable.tsx` que reemplaza
 * (Ajustes remotos / Regenerar llave / Revocar licencia), ahora bajo un menú
 * EXPLÍCITO en el chevron (clic, no hover) — visible/descubrible siempre. */
export default function AgentRowActionsMenu({
  agent, open, onToggle, onClose, onConfig, onRegen, onRevoke,
}: {
  agent: Pick<AgentDirectoryRow, 'id' | 'name' | 'status'>;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onConfig: () => void;
  onRegen: () => void;
  onRevoke: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative flex justify-end">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
        aria-label={`Acciones para ${agent.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line-avatar text-ink-300 transition-colors duration-150 ease-in-out hover:border-line-300 hover:text-ink-100"
      >
        <ChevronRight size={13} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[30px] z-20 w-[196px] overflow-hidden rounded-[3px] border border-line-100 bg-white py-1"
          style={{ boxShadow: '0 8px 24px rgba(20,20,20,.14)' }}
        >
          {agent.status !== 'revoked' && <MenuItem icon={<Settings size={13} />} label="Ajustes remotos" onClick={onConfig} />}
          {agent.status !== 'revoked' && <MenuItem icon={<Key size={13} />} label="Regenerar llave" onClick={onRegen} />}
          {agent.status === 'active' && <MenuItem icon={<ShieldOff size={13} />} label="Revocar licencia" onClick={onRevoke} danger />}
        </div>
      )}
    </div>
  );
}
