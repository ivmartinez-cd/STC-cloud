import { useState, useEffect, useCallback } from 'react';
import { Archive, Loader2, X } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import ConfigCardShell from './ConfigCardShell';
import type { CustomFieldDef, CustomFieldType } from '../../../shared/types/inventory';

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texto', number: 'Número', date: 'Fecha', select: 'Lista (select)', boolean: 'Sí/No',
};

/**
 * Campos personalizados por cliente (Fase 4 del gap analysis vs HP SDS — vi
 * "Color Cost Per Page" como campo custom en HP SDS Manager). Mismo patrón
 * de tarjeta que `ApiKeysCard.tsx`: listar/crear/archivar, oculto para
 * client_viewer.
 */
export default function CustomFieldsCard({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<CustomFieldType>('text');
  const [newOptions, setNewOptions] = useState('');
  const [busy, setBusy] = useState(false);
  const [toArchive, setToArchive] = useState<CustomFieldDef | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<CustomFieldDef[]>(`/clients/${clientId}/custom-fields`)
      .then(setFields)
      .catch(() => setFields([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newKey.trim() || !newLabel.trim()) return;
    setBusy(true);
    try {
      const options = newType === 'select' ? newOptions.split(',').map((o) => o.trim()).filter(Boolean) : undefined;
      await api.post(`/clients/${clientId}/custom-fields`, { key: newKey.trim(), label: newLabel.trim(), type: newType, options });
      setNewKey(''); setNewLabel(''); setNewType('text'); setNewOptions(''); setCreating(false);
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al crear el campo', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!toArchive) return;
    setBusy(true);
    try {
      await api.delete(`/clients/${clientId}/custom-fields/${toArchive.id}`);
      showToast(`Campo "${toArchive.label}" archivado`, 'success');
      setToArchive(null);
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al archivar', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfigCardShell
      title="Campos personalizados"
      status={{ label: fields.length > 0 ? `${fields.length} definido${fields.length === 1 ? '' : 's'}` : 'SIN CONFIGURAR', active: fields.length > 0 }}
      meta={`${fields.length} campo${fields.length === 1 ? '' : 's'} definido${fields.length === 1 ? '' : 's'}`}
      cta={{ label: 'Agregar campo', onClick: () => setCreating(true) }}
    >
      <p className="mb-3.5 font-sans text-[12.5px] leading-[1.55] text-ink-100">
        Agregá centro de costo, sucursal o responsable para clasificar los dispositivos de este cliente en los informes.
      </p>

      {creating && (
        <div className="space-y-2 mb-4 p-4 bg-slate-50/50 rounded-2xl">
          <div className="flex items-center gap-2">
            <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="key (ej. color_cost_per_page)"
              className="cd-input flex-1 !bg-white text-sm font-mono" />
            <select value={newType} onChange={(e) => setNewType(e.target.value as CustomFieldType)} className="cd-input !bg-white text-sm">
              {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Etiqueta visible (ej. Costo por página color)"
            className="cd-input w-full !bg-white text-sm" />
          {newType === 'select' && (
            <input type="text" value={newOptions} onChange={(e) => setNewOptions(e.target.value)}
              placeholder="Opciones separadas por coma"
              className="cd-input w-full !bg-white text-sm" />
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setCreating(false)} className="p-2.5 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={16} /></button>
            <button onClick={handleCreate} disabled={busy || !newKey.trim() || !newLabel.trim()}
              className="px-4 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-60">
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs font-semibold text-slate-400">Cargando…</p>
      ) : fields.length === 0 ? (
        <p className="text-xs font-semibold text-slate-400">Sin campos personalizados definidos para este cliente.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {fields.map((f) => (
            <li key={f.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-700">{f.label}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">{f.key} · {TYPE_LABELS[f.type]}{f.client_id === null ? ' · global' : ''}</p>
              </div>
              {canEdit && f.client_id !== null && (
                <button onClick={() => setToArchive(f)} className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all" title="Archivar">
                  <Archive size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        isOpen={!!toArchive}
        onClose={() => setToArchive(null)}
        onConfirm={handleArchive}
        title="Archivar campo personalizado"
        message={toArchive ? `Se archivará "${toArchive.label}". Los valores ya guardados en equipos no se borran, sólo dejan de mostrarse.` : ''}
        confirmText="Archivar"
        isDanger
        isLoading={busy}
      />
    </ConfigCardShell>
  );
}
