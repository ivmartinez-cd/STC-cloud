import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Client, Monitor } from '../../../shared/types/monitor';
import { CLIENT_ESTADO_LABEL, deriveClientEstado, type ClientEstado } from '../lib/clientEstado';
import EditClientModal from './EditClientModal';
import { APP_LOCALE } from '../../../shared/lib/formatters';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function EstadoChip({ estado }: { estado: ClientEstado }) {
  const activo = estado === 'activo';
  return (
    <span
      className={`inline-flex items-center gap-[7px] rounded-[2px] px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] ${
        activo ? 'bg-surface-avatar text-ink-650' : 'bg-brand-soft text-brand-accent'
      }`}
    >
      <span className={`block h-1.5 w-1.5 rounded-full ${activo ? 'bg-brand-gray' : 'bg-brand'}`} />
      {CLIENT_ESTADO_LABEL[estado]}
    </span>
  );
}

const ACTION_BASE = 'rounded-[3px] px-4 py-[10px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

/** Header interno de la tarjeta de identidad (handoff hifi "Cliente — detalle",
 * 25/08/2026) — avatar + nombre + chip de estado + metadatos + acciones. La tira
 * de 6 métricas y las tabs viven en componentes hermanos (`ClientMetricsStrip.tsx`/
 * `ClientDetailTabs.tsx`), compuestos junto a éste en `ClientDetail.tsx`. */
export default function ClientProfileCard({
  client, monitors, canEdit, onSave,
}: {
  client: Client;
  monitors: Monitor[];
  canEdit: boolean;
  onSave: (fields: { name: string; contact_name: string; contact_phone: string; contact_email: string; address: string; country: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const estado = deriveClientEstado(client, monitors);
  const location = [client.country, client.address].filter(Boolean).join(' · ');
  const altaDate = new Date(client.created_at).toLocaleDateString(APP_LOCALE);
  const shortId = client.id.replace(/-/g, '').slice(0, 13).toUpperCase();

  return (
    <div className="flex flex-wrap items-start justify-between gap-5 px-6 pb-5 pt-[22px] short:pb-3 short:pt-3">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[4px] border border-brand-chip-border bg-brand-soft font-montserrat text-[16px] font-bold text-brand-accent">
          {initialsOf(client.name)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[11px]">
            <h1 className="m-0 font-montserrat text-[27px] font-extrabold leading-[1.1] tracking-[-.015em] text-ink-900">{client.name}</h1>
            <EstadoChip estado={estado} />
          </div>
          <div className="mt-[9px] flex flex-wrap items-center gap-2.5 font-sans text-[12.5px] leading-snug text-ink-400">
            {location && <span>{location}</span>}
            {location && <span className="text-ink-sep">·</span>}
            <span>Alta {altaDate}</span>
            <span className="text-ink-sep">·</span>
            <span>ID {shortId}</span>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`${ACTION_BASE} border border-line-300 bg-white text-ink-600 hover:border-line-hover hover:bg-surface-btn-hover`}
          >
            Editar cliente
          </button>
          <Link to={`/pending?client_id=${client.id}`} className={`${ACTION_BASE} bg-brand text-white hover:bg-brand-severe`}>
            + Agregar dispositivo
          </Link>
        </div>
      )}

      {editing && <EditClientModal isOpen={editing} client={client} onClose={() => setEditing(false)} onSave={onSave} />}
    </div>
  );
}
