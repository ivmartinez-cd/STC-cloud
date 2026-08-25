import { useEffect, useState } from 'react';
import { BrandModal } from '../BrandModal';
import { api } from '../../lib/api';
import type { CustomFieldDef } from '../../types/inventory';

interface EditDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  deviceId: string;
  currentName: string;
  currentLocation: string | null;
  reportedName: string | null;
  reportedLocation: string | null;
  // Inventario (Fase 4 del gap analysis vs HP SDS) — todos opcionales para no
  // romper otros callers de este modal que todavía no pasan estos props.
  currentAssetNumber?: string | null;
  currentAssetTag?: string | null;
  currentDutyCycle?: number | null;
  customFieldDefs?: CustomFieldDef[];
  currentCustomData?: Record<string, unknown> | null;
}

export function EditDeviceModal({
  isOpen, onClose, onSaved, deviceId, currentName, currentLocation, reportedName, reportedLocation,
  currentAssetNumber, currentAssetTag, currentDutyCycle, customFieldDefs = [], currentCustomData,
}: EditDeviceModalProps) {
  const [name, setName] = useState(currentName);
  const [location, setLocation] = useState(currentLocation ?? '');
  const [assetNumber, setAssetNumber] = useState(currentAssetNumber ?? '');
  const [assetTag, setAssetTag] = useState(currentAssetTag ?? '');
  const [dutyCycle, setDutyCycle] = useState(currentDutyCycle != null ? String(currentDutyCycle) : '');
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(currentName);
    setLocation(currentLocation ?? '');
    setAssetNumber(currentAssetNumber ?? '');
    setAssetTag(currentAssetTag ?? '');
    setDutyCycle(currentDutyCycle != null ? String(currentDutyCycle) : '');
    const initialCustom: Record<string, string> = {};
    for (const def of customFieldDefs) {
      const v = currentCustomData?.[def.key];
      initialCustom[def.key] = v == null ? '' : String(v);
    }
    setCustomValues(initialCustom);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentName, currentLocation, currentAssetNumber, currentAssetTag, currentDutyCycle]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const customData: Record<string, unknown> = {};
      for (const def of customFieldDefs) {
        const raw = customValues[def.key];
        if (raw === '' || raw === undefined) { customData[def.key] = null; continue; }
        customData[def.key] = def.type === 'boolean' ? raw === 'true' : def.type === 'number' ? Number(raw) : raw;
      }
      await api.put(`/devices/${deviceId}`, {
        name, location: location || null,
        asset_number: assetNumber || null,
        asset_tag: assetTag || null,
        duty_cycle_monthly: dutyCycle ? Number(dutyCycle) : null,
        ...(customFieldDefs.length ? { custom_data: customData } : {}),
      });
      onSaved(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title="Editar equipo" widthPx={480} error={error}>
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
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
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Nº de activo</label>
          <input value={assetNumber} onChange={(e) => setAssetNumber(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ej: ACT-00123" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Nº de etiqueta</label>
          <input value={assetTag} onChange={(e) => setAssetTag(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ej: INV-4521" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Ciclos de trabajo (páginas/mes)</label>
          <input type="number" min={1} value={dutyCycle} onChange={(e) => setDutyCycle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Vacío = usar el del catálogo de modelos" />
        </div>
        {customFieldDefs.map((def) => (
          <div key={def.id}>
            <label className="block text-xs font-bold text-slate-600 mb-1">{def.label}</label>
            {def.type === 'select' ? (
              <select value={customValues[def.key] ?? ''} onChange={(e) => setCustomValues((v) => ({ ...v, [def.key]: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">—</option>
                {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : def.type === 'boolean' ? (
              <select value={customValues[def.key] ?? ''} onChange={(e) => setCustomValues((v) => ({ ...v, [def.key]: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">—</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                value={customValues[def.key] ?? ''}
                onChange={(e) => setCustomValues((v) => ({ ...v, [def.key]: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            )}
          </div>
        ))}
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
