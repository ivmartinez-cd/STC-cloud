import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../../../shared/lib/api';
import { useToast } from '../../../../store/ToastContext';
import { BrandModal } from '../../../../shared/components/BrandModal';
import {
  ACTION_LABELS, DEVICE_TARGETED_ACTIONS, deviceLabelOf,
  type AgentOption, type ClientOption, type DeviceOption,
} from '../../types/remoteActions';

const LABEL_CLS = 'mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';
const INPUT_CLS = 'w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand';
const CHECKLIST_CLS = 'max-h-48 space-y-1 overflow-y-auto rounded-[3px] border border-line-300 p-3';

function ActionAndScheduleFields({ action, onAction, when, onWhen }: {
  action: string; onAction: (v: string) => void; when: string; onWhen: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={LABEL_CLS}>Acción</label>
        <select value={action} onChange={(e) => onAction(e.target.value)} className={INPUT_CLS}>
          {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL_CLS}>Programar para (opcional)</label>
        <input type="datetime-local" value={when} onChange={(e) => onWhen(e.target.value)} className={INPUT_CLS} />
      </div>
    </div>
  );
}

function DeviceChecklist({ devices, selectedDevices, onToggleDevice }: {
  devices: DeviceOption[]; selectedDevices: string[]; onToggleDevice: (id: string) => void;
}) {
  return (
    <div>
      <label className={LABEL_CLS}>Equipos ({selectedDevices.length} seleccionados)</label>
      <div className={CHECKLIST_CLS}>
        {devices.length === 0 && <p className="font-sans text-xs text-ink-300">Elegí un cliente para ver sus equipos.</p>}
        {devices.map((d) => (
          <label key={d.id} className="flex cursor-pointer items-center gap-2 font-sans text-xs font-semibold text-ink-700">
            <input type="checkbox" checked={selectedDevices.includes(d.id)} onChange={() => onToggleDevice(d.id)} />
            {deviceLabelOf(d)}
          </label>
        ))}
      </div>
    </div>
  );
}

function DeviceTargetSection({ clients, targetClientId, onClient, devices, selectedDevices, onToggleDevice }: {
  clients: ClientOption[]; targetClientId: string; onClient: (id: string) => void;
  devices: DeviceOption[]; selectedDevices: string[]; onToggleDevice: (id: string) => void;
}) {
  return (
    <>
      <p className="-mt-1 font-sans text-[11px] font-semibold text-brand-warn-text">
        Requiere que la credencial SNMP configurada tenga permiso de escritura en el equipo — si no lo tiene, el lote queda "Completado con errores" con el motivo.
      </p>
      <div>
        <label className={LABEL_CLS}>Cliente</label>
        <select value={targetClientId} className={INPUT_CLS} onChange={(e) => onClient(e.target.value)}>
          <option value="">Elegir cliente…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <DeviceChecklist devices={devices} selectedDevices={selectedDevices} onToggleDevice={onToggleDevice} />
    </>
  );
}

function AgentTargetSection({ agents, selectedAgents, onToggleAgent }: {
  agents: AgentOption[]; selectedAgents: string[]; onToggleAgent: (id: string) => void;
}) {
  return (
    <div>
      <label className={LABEL_CLS}>Monitores ({selectedAgents.length} seleccionados)</label>
      <div className={CHECKLIST_CLS}>
        {agents.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center gap-2 font-sans text-xs font-semibold text-ink-700">
            <input type="checkbox" checked={selectedAgents.includes(a.id)} onChange={() => onToggleAgent(a.id)} />
            {a.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function ModalFooter({ onCancel, onCreate, saving, disabled }: { onCancel: () => void; onCreate: () => void; saving: boolean; disabled: boolean }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className="rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
        Cancelar
      </button>
      <button
        type="button" onClick={onCreate} disabled={saving || disabled}
        className="flex items-center justify-center gap-2 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
      >
        {saving && <Loader2 size={14} className="animate-spin" />} Crear lote
      </button>
    </div>
  );
}

/** Agentes/clientes/equipos disponibles para elegir como destino — separado
 * de `useBatchFormFields` para que ninguna función pase el límite de
 * 20 líneas (guía §4). */
function useOptionsData(isOpen: boolean, targetClientId: string) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    api.get<AgentOption[]>('/agents').then((a) => setAgents(a.filter((x) => x.status !== 'revoked'))).catch(() => setAgents([]));
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([]));
  }, [isOpen]);

  useEffect(() => {
    if (!targetClientId) { setDevices([]); return; }
    api.get<DeviceOption[]>(`/clients/${targetClientId}/devices`).then(setDevices).catch(() => setDevices([]));
  }, [targetClientId]);

  return { agents, clients, devices };
}

/** Campos del formulario + sus togglers — sin lógica de red. */
function useBatchFormFields() {
  const [action, setAction] = useState('RESCAN');
  const [name, setName] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [targetClientId, setTargetClientId] = useState('');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [when, setWhen] = useState('');

  const onClient = (id: string) => { setTargetClientId(id); setSelectedDevices([]); };
  const toggleAgent = (id: string) => setSelectedAgents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleDevice = (id: string) => setSelectedDevices((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const reset = () => { setSelectedAgents([]); setSelectedDevices([]); setTargetClientId(''); setName(''); setWhen(''); };

  return {
    action, setAction, name, setName, selectedAgents, toggleAgent,
    targetClientId, onClient, selectedDevices, toggleDevice, when, setWhen, reset,
  };
}

type BatchFormFields = ReturnType<typeof useBatchFormFields>;

function batchPayload(fields: BatchFormFields, isDeviceTargeted: boolean) {
  return {
    action: fields.action, name: fields.name.trim() || null,
    ...(isDeviceTargeted ? { device_ids: fields.selectedDevices } : { agent_ids: fields.selectedAgents }),
    scheduled_at: fields.when ? new Date(fields.when).toISOString() : null,
  };
}

/** POST del lote — separado para que `create` no cuente hacia el largo de
 * ninguna otra función. */
function useBatchSubmit(fields: BatchFormFields, isDeviceTargeted: boolean, onClose: () => void, onCreated: () => void) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setSaving(true); setError(null);
    try {
      await api.post('/remote-actions', batchPayload(fields, isDeviceTargeted));
      showToast('Lote creado', 'success');
      fields.reset(); onClose(); onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear');
    } finally { setSaving(false); }
  };

  return { saving, error, create };
}

/** Une las tres piezas de estado del alta de lote — separado del render
 * (guía §4: ninguna función arriba de 20 líneas). */
function useCreateBatchForm(isOpen: boolean, onClose: () => void, onCreated: () => void) {
  const fields = useBatchFormFields();
  const isDeviceTargeted = DEVICE_TARGETED_ACTIONS.has(fields.action);
  const { agents, clients, devices } = useOptionsData(isOpen, fields.targetClientId);
  const { saving, error, create } = useBatchSubmit(fields, isDeviceTargeted, onClose, onCreated);
  return { ...fields, agents, clients, devices, saving, error, isDeviceTargeted, create };
}

/** Alta de lote de acción remota (Fase 4.6 del gap analysis vs HP SDS) —
 * restyle institucional del modal existente, misma lógica de negocio:
 * RESTART_PRINTER targetea equipos (cliente → picker), el resto targetea
 * agentes (checklist). */
export default function CreateBatchModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: () => void }) {
  const f = useCreateBatchForm(isOpen, onClose, onCreated);
  const disabled = f.isDeviceTargeted ? f.selectedDevices.length === 0 : f.selectedAgents.length === 0;

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title="Nueva acción en bloque" widthPx={560} error={f.error}>
      <div className="space-y-4">
        <ActionAndScheduleFields action={f.action} onAction={f.setAction} when={f.when} onWhen={f.setWhen} />
        <div>
          <label className={LABEL_CLS}>Nombre (opcional)</label>
          <input value={f.name} onChange={(e) => f.setName(e.target.value)} placeholder="Ej: Relectura fin de mes" className={INPUT_CLS} />
        </div>
        {f.isDeviceTargeted
          ? <DeviceTargetSection clients={f.clients} targetClientId={f.targetClientId} onClient={f.onClient} devices={f.devices} selectedDevices={f.selectedDevices} onToggleDevice={f.toggleDevice} />
          : <AgentTargetSection agents={f.agents} selectedAgents={f.selectedAgents} onToggleAgent={f.toggleAgent} />}
        <ModalFooter onCancel={onClose} onCreate={f.create} saving={f.saving} disabled={disabled} />
      </div>
    </BrandModal>
  );
}
