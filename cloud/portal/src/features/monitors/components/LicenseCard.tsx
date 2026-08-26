import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { fmt, APP_LOCALE } from '../../../shared/lib/formatters';
import type { MonitorData } from '../../../shared/types/monitor';
import type { AgentLicense } from '../types/monitorDetail';

interface Props {
  monitor: MonitorData;
  license: AgentLicense | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  keyCopied: boolean;
  onCopyKey: () => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** "Licencia y vínculo" (handoff hifi "Monitor — detalle", 25/08/2026) — organización
 * vinculada, hardware identifier (copiable), aviso de enlace cifrado y vigencia/fechas.
 * Un agente aún `pending` (nunca activado, sin `hardware_id`) no tiene nada de esto
 * todavía — se mantiene el bloque simple original de "llave de activación" para ese
 * caso (workflow real de alta de monitores, fuera del alcance del handoff). */
export default function LicenseCard({ monitor, license, loading, error, onRetry, keyCopied, onCopyKey }: Props) {
  const [hwCopied, setHwCopied] = useState(false);

  const copyHardwareId = () => {
    if (!license?.hardware_id) return;
    navigator.clipboard.writeText(license.hardware_id);
    setHwCopied(true);
    setTimeout(() => setHwCopied(false), 1500);
  };

  if (monitor.status === 'pending' && monitor.activation_key) {
    return (
      <div className="flex h-full flex-col rounded-[5px] border border-line-100 bg-white">
        <div className="flex items-center justify-between px-5 py-3.5">
          <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Licencia y vínculo</span>
          <span className="inline-flex items-center gap-[7px] rounded-[2px] bg-brand-soft px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-brand-accent">
            <span className="block h-1.5 w-1.5 rounded-full bg-brand" /> Pendiente de activación
          </span>
        </div>
        <div className="flex-1 px-5 pb-5 pt-1">
          <p className="mb-2.5 font-sans text-[12.5px] text-ink-700">Instalá el agente en el sitio y usá esta llave para activarlo.</p>
          <div className="flex items-center gap-2.5 rounded-[3px] border border-line-150 bg-surface-input px-[13px] py-[10px]">
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px] text-ink-600">{monitor.activation_key}</span>
            <button type="button" onClick={onCopyKey} className="shrink-0 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
              {keyCopied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-[5px] border border-line-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Licencia y vínculo</span>
        {!loading && !error && license && (
          <span className={`inline-flex items-center gap-[7px] rounded-[2px] px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] ${
            license.estado === 'vigente' ? 'bg-surface-avatar text-ink-650' : 'bg-brand-soft text-brand-severe'
          }`}>
            <span className={`block h-1.5 w-1.5 rounded-full ${license.estado === 'vigente' ? 'bg-brand-gray' : 'bg-brand-severe'}`} />
            {license.estado === 'vigente' ? 'Vigente' : 'Revocada'}
          </span>
        )}
      </div>

      {error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-5 pb-6 text-center">
          <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
          <button type="button" onClick={onRetry} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">Reintentar</button>
        </div>
      )}

      {!error && (loading || !license) && (
        <div className="flex-1 space-y-3 px-5 pb-5 pt-1">
          <div className="h-16 animate-pulse rounded-[3px] bg-surface-track" />
          <div className="h-10 animate-pulse rounded-[3px] bg-surface-track" />
          <div className="h-12 animate-pulse rounded-[3px] bg-surface-track" />
        </div>
      )}

      {!error && !loading && license && (
        <div className="flex-1 px-5 pb-[18px] pt-1">
          <div className="mb-[9px] font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Organización vinculada</div>
          <Link
            to={`/clients/${monitor.client_id}`}
            className="mb-4 flex items-center gap-3 rounded-[3px] border border-line-150 bg-surface-input px-[13px] py-[11px] hover:bg-surface-btn-hover"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-brand-chip-border bg-brand-soft font-montserrat text-[10.5px] font-bold text-brand-accent">
              {initialsOf(license.organizacion.nombre)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{license.organizacion.nombre}</div>
              <div className="font-sans text-[11px] text-ink-300">
                {fmt(license.organizacion.device_count)} dispositivos · {fmt(license.organizacion.monitor_count)} monitores
              </div>
            </div>
            <span className="shrink-0 whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent">Ver perfil →</span>
          </Link>

          <div className="mb-[9px] flex items-center gap-2 font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Hardware identifier</div>
          <div className="mb-4 flex items-center gap-2.5 rounded-[3px] border border-line-150 bg-surface-input px-[13px] py-[10px]">
            <span
              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px] text-ink-600"
              aria-label={license.hardware_id ?? 'sin vincular'}
            >
              {license.hardware_id || 'SIN VINCULAR'}
            </span>
            {license.hardware_id && (
              <button type="button" onClick={copyHardwareId} className="flex shrink-0 items-center gap-1 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
                {hwCopied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
              </button>
            )}
          </div>

          <div className="mb-4 flex items-center gap-[11px] rounded-[3px] border border-brand-chip-border bg-brand-soft px-[13px] py-3">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">✓</span>
            <div>
              <div className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-brand-accent">Enlace cifrado</div>
              <div className="font-sans text-[12px] text-[var(--color-brand-warn-text)]">
                Telemetría activa · TLS 1.3 · rotación cada {license.rotacion_dias} días
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-line-200 py-2">
            <span className="font-sans text-[12.5px] text-ink-700">Emitida</span>
            <span className="font-sans text-[12.5px] font-semibold text-ink-900">{new Date(license.emitida_at).toLocaleDateString(APP_LOCALE)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="font-sans text-[12.5px] text-ink-700">Próxima rotación</span>
            <span className="font-sans text-[12.5px] font-semibold text-ink-900">{new Date(license.proxima_rotacion_at).toLocaleDateString(APP_LOCALE)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
