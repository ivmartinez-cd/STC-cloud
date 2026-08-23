import { useEffect, useState } from 'react';
import { BrandModal } from '../ui/BrandModal';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { api } from '../../lib/api';

/**
 * Modales de ciclo de vida de dispositivo (§2.4 del gap analysis): editar,
 * dar de baja, mover y fusionar. Todos usan el chrome existente
 * (`BrandModal`/`ConfirmationModal`) — sin componentes de UI nuevos.
 */

// ─── Editar nombre/ubicación ─────────────────────────────────────────────────

interface EditDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  deviceId: string;
  currentName: string;
  currentLocation: string | null;
  reportedName: string | null;
  reportedLocation: string | null;
}

export function EditDeviceModal({ isOpen, onClose, onSaved, deviceId, currentName, currentLocation, reportedName, reportedLocation }: EditDeviceModalProps) {
  const [name, setName] = useState(currentName);
  const [location, setLocation] = useState(currentLocation ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (isOpen) { setName(currentName); setLocation(currentLocation ?? ''); setError(null); } }, [isOpen, currentName, currentLocation]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await api.put(`/devices/${deviceId}`, { name, location: location || null });
      onSaved(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title="Editar equipo" widthPx={480} error={error}>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          {reportedName && reportedName !== name && (
            <p className="text-[11px] text-slate-400 mt-1">Reportado por el agente: {reportedName}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Ubicación</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ej: Piso 3, oficina de RRHH" />
          {reportedLocation && reportedLocation !== location && (
            <p className="text-[11px] text-slate-400 mt-1">Reportado por el agente: {reportedLocation}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}

// ─── Dar de baja ──────────────────────────────────────────────────────────────

interface DecommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  deviceId: string;
}

export function DecommissionDeviceModal({ isOpen, onClose, onDone, deviceId }: DecommissionModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (isOpen) { setReason(''); setError(null); } }, [isOpen]);

  const confirm = async () => {
    setLoading(true); setError(null);
    try {
      await api.post(`/devices/${deviceId}/decommission`, { reason });
      onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmationModal
      isOpen={isOpen} onClose={onClose} onConfirm={confirm} title="Dar de baja este equipo"
      variant="warning" confirmLabel="Dar de baja" loading={loading} error={error}
      confirmDisabled={!reason.trim()}
      extra={
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder="Motivo de la baja (obligatorio)"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm mt-2"
        />
      }
    >
      El equipo deja de contarse en inventario, dashboard y alertas. Su historial de lecturas
      y sus cierres de facturación se conservan intactos, y se puede reactivar en cualquier momento.
    </ConfirmationModal>
  );
}

// ─── Mover ────────────────────────────────────────────────────────────────────

interface ClientOption { id: string; name: string; }
interface AgentOption { id: string; name: string; }

interface MoveDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  deviceId: string;
  currentClientId: string | null;
  currentAgentId: string | null;
}

export function MoveDeviceModal({ isOpen, onClose, onDone, deviceId, currentClientId, currentAgentId }: MoveDeviceModalProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmClientChange, setConfirmClientChange] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReason(''); setError(null); setConfirmClientChange(false);
    setClientId(currentClientId ?? '');
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([]));
  }, [isOpen, currentClientId]);

  useEffect(() => {
    if (!clientId) { setAgents([]); return; }
    api.get<AgentOption[]>(`/clients/${clientId}/monitors`).then(setAgents).catch(() => setAgents([]));
  }, [clientId]);

  const clientChanged = clientId !== currentClientId;

  const move = async () => {
    setLoading(true); setError(null);
    try {
      await api.post(`/devices/${deviceId}/move`, {
        agentId, reason, ...(clientChanged ? { confirmClientChange } : {}),
      });
      onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title="Mover equipo" widthPx={480} error={error}>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Cliente destino</label>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setAgentId(''); }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">Seleccionar…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Monitor destino</label>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" disabled={!clientId}>
            <option value="">Seleccionar…</option>
            {agents.filter((a) => a.id !== currentAgentId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Motivo</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        {clientChanged && clientId && (
          <label className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
            <input type="checkbox" checked={confirmClientChange} onChange={(e) => setConfirmClientChange(e.target.checked)} className="mt-0.5" />
            Entiendo que el historial ya facturado a este cliente queda con el cliente anterior — el cierre emitido no se recalcula.
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button
            onClick={move}
            disabled={loading || !agentId || !reason.trim() || (clientChanged && !confirmClientChange)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {loading ? 'Moviendo…' : 'Mover'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}

// ─── Fusionar ─────────────────────────────────────────────────────────────────

interface DuplicateCandidate {
  a_id: string; a_serial: string | null; a_mac: string | null; a_ip: string | null;
  b_id: string; b_serial: string | null; b_mac: string | null; b_ip: string | null;
  reason: string;
}

interface MergeDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  deviceId: string;
  clientId: string | null;
}

export function MergeDeviceModal({ isOpen, onClose, onDone, deviceId, clientId }: MergeDeviceModalProps) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!isOpen || !clientId) return;
    setSourceId(''); setError(null); setTyped('');
    api.get<DuplicateCandidate[]>(`/devices/duplicates?client_id=${clientId}`)
      .then((rows) => setCandidates(rows.filter((r) => r.a_id === deviceId || r.b_id === deviceId)))
      .catch(() => setCandidates([]));
  }, [isOpen, clientId, deviceId]);

  const confirm = async () => {
    setLoading(true); setError(null);
    try {
      await api.post(`/devices/${deviceId}/merge`, { sourceDeviceId: sourceId });
      onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const otherIdOf = (c: DuplicateCandidate) => (c.a_id === deviceId ? c.b_id : c.a_id);
  const labelOf = (c: DuplicateCandidate) => {
    const other = c.a_id === deviceId ? { serial: c.b_serial, mac: c.b_mac, ip: c.b_ip } : { serial: c.a_serial, mac: c.a_mac, ip: c.a_ip };
    return `${other.serial ?? other.ip ?? other.mac ?? '—'} (${c.reason})`;
  };

  return (
    <ConfirmationModal
      isOpen={isOpen} onClose={onClose} onConfirm={confirm} title="Fusionar con un duplicado"
      variant="destructive" confirmLabel="Fusionar" confirmText="FUSIONAR" loading={loading} error={error}
      confirmDisabled={!sourceId || typed !== 'FUSIONAR'}
      extra={
        <div className="space-y-3 mt-2">
          {candidates.length === 0 ? (
            <p className="text-[11px] text-slate-500">No se detectaron duplicados candidatos para este equipo.</p>
          ) : (
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">Elegí el equipo a fusionar…</option>
              {candidates.map((c) => (
                <option key={otherIdOf(c)} value={otherIdOf(c)}>{labelOf(c)}</option>
              ))}
            </select>
          )}
          <input
            value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Escribí FUSIONAR para confirmar"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      }
    >
      Este equipo quedará como registro fusionado (lápida): sus lecturas y alertas se mueven al superviviente,
      y sus cierres de facturación ya emitidos no se alteran. La acción no se puede deshacer desde el portal.
    </ConfirmationModal>
  );
}
