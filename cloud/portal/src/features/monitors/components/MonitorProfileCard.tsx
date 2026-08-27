import type { MonitorData } from '../../../shared/types/monitor';

const ACTION_BASE = 'rounded-[3px] px-[15px] py-[10px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const STATUS_LABEL: Record<string, string> = {
  active: 'ACTIVO', offline: 'OFFLINE', pending: 'PENDIENTE', revoked: 'REVOCADO',
};

/** Chip de contacto — umbrales del README: <5 min "hace X s/min" (naranja),
 * 5–60 min "hace X min" (naranja), >60 min "SIN CONTACTO" (severo, el estado del
 * monitor pasa a INACTIVO en el 1er chip). */
function contactInfo(lastSeen: string | null, now: number): { label: string; severe: boolean } {
  if (!lastSeen) return { label: 'SIN CONTACTO', severe: true };
  const diffMs = Math.max(0, now - new Date(lastSeen).getTime());
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin >= 60) return { label: 'SIN CONTACTO', severe: true };
  if (diffMin >= 1) return { label: `ÚLTIMO CONTACTO HACE ${diffMin} MIN`, severe: false };
  const diffSec = Math.max(1, Math.floor(diffMs / 1000));
  return { label: `ÚLTIMO CONTACTO HACE ${diffSec} S`, severe: false };
}

interface Props {
  monitor: MonitorData;
  now: number;
  isReadOnlyViewer: boolean;
  syncing: boolean;
  onSync: () => void;
  onDownloadLogs: () => void;
  onOpenSettings: () => void;
  onRegenKey: () => void;
}

export default function MonitorProfileCard({
  monitor, now, isReadOnlyViewer, syncing, onSync, onDownloadLogs, onOpenSettings, onRegenKey,
}: Props) {
  const contact = contactInfo(monitor.last_seen, now);
  const statusLabel = contact.severe ? 'INACTIVO' : (STATUS_LABEL[monitor.status] ?? monitor.status.toUpperCase());
  const metaParts = [
    `${monitor.name ? 'STC Cloud Agent' : ''}${monitor.version ? ` v${monitor.version}` : ''}`.trim() || 'STC Cloud Agent',
    [monitor.host_name, monitor.host_os].filter(Boolean).join(' · '),
    monitor.host_ip,
    monitor.client_name,
  ].filter((p): p is string => !!p && p.trim().length > 0);

  return (
    <div className="flex flex-wrap items-start justify-between gap-5 px-6 pb-5 pt-[22px] short:pb-3 short:pt-3">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[4px] border border-brand-chip-border bg-brand-soft font-montserrat text-[15px] font-bold text-brand-accent">
          {initialsOf(monitor.name)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[11px]">
            <h1 className="m-0 font-montserrat text-[27px] font-extrabold leading-[1.1] tracking-[-.015em] text-ink-900">{monitor.name}</h1>
            <span className="inline-flex items-center gap-[7px] rounded-[2px] bg-surface-avatar px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-650">
              <span className="block h-1.5 w-1.5 rounded-full bg-brand-gray" /> {statusLabel}
            </span>
            <span className={`inline-flex items-center gap-[7px] rounded-[2px] px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] ${
              contact.severe ? 'bg-brand-soft text-brand-severe' : 'bg-brand-soft text-brand-accent'
            }`}>
              <span className={`block h-1.5 w-1.5 rounded-full ${contact.severe ? 'bg-brand-severe' : 'bg-brand'}`} /> {contact.label}
            </span>
          </div>
          <div className="mt-[9px] flex flex-wrap items-center gap-2.5 font-sans text-[12.5px] leading-snug text-ink-400">
            {metaParts.map((part, i) => (
              <span key={i} className="flex items-center gap-2.5">
                {i > 0 && <span className="text-ink-sep">·</span>}
                {part}
              </span>
            ))}
          </div>
        </div>
      </div>

      {!isReadOnlyViewer && (
        <div className="flex flex-wrap gap-[9px]">
          <button type="button" onClick={onDownloadLogs} className={`${ACTION_BASE} border border-line-300 bg-white text-ink-600 hover:border-line-hover hover:bg-surface-btn-hover`}>
            Descargar logs
          </button>
          <button type="button" onClick={onOpenSettings} className={`${ACTION_BASE} border border-line-300 bg-white text-ink-600 hover:border-line-hover hover:bg-surface-btn-hover`}>
            Ajustes
          </button>
          <button type="button" onClick={onRegenKey} className={`${ACTION_BASE} border border-brand-chip-border bg-brand-soft text-brand-accent hover:bg-[var(--color-brand-warn-hover)]`}>
            Regenerar llave
          </button>
          <button
            type="button" onClick={onSync} disabled={syncing}
            className={`${ACTION_BASE} bg-brand text-white hover:bg-brand-severe disabled:cursor-default disabled:opacity-70`}
          >
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        </div>
      )}
    </div>
  );
}
