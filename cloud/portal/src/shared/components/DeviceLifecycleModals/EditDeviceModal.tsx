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
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand" />
          {reportedName && reportedName !== name && (
            <p className="mt-1 font-sans text-[11px] text-ink-300">Reportado por el agente: {reportedName}</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Ubicación</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand" placeholder="Ej: Piso 3, oficina de RRHH" />
          {reportedLocation && reportedLocation !== location && (
            <p className="mt-1 font-sans text-[11px] text-ink-300">Reportado por el agente: {reportedLocation}</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Nº de activo</label>
          <input value={assetNumber} onChange={(e) => setAssetNumber(e.target.value)} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[13px] text-ink-900 outline-none focus:border-brand" placeholder="Ej: ACT-00123" />
        </div>
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Nº de etiqueta</label>
          <input value={assetTag} onChange={(e) => setAssetTag(e.target.value)} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[13px] text-ink-900 outline-none focus:border-brand" placeholder="Ej: INV-4521" />
        </div>
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Ciclos de trabajo (páginas/mes)</label>
          <input type="number" min={1} value={dutyCycle} onChange={(e) => setDutyCycle(e.target.value)} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand" placeholder="Vacío = usar el del catálogo de modelos" />
        </div>
        {customFieldDefs.map((def) => (
          <div key={def.id}>
            <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">{def.label}</label>
            {def.type === 'select' ? (
              <select value={customValues[def.key] ?? ''} onChange={(e) => setCustomValues((v) => ({ ...v, [def.key]: e.target.value }))} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand">
                <option value="">—</option>
                {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : def.type === 'boolean' ? (
              <select value={customValues[def.key] ?? ''} onChange={(e) => setCustomValues((v) => ({ ...v, [def.key]: e.target.value }))} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand">
                <option value="">—</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                value={customValues[def.key] ?? ''}
                onChange={(e) => setCustomValues((v) => ({ ...v, [def.key]: e.target.value }))}
                className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand"
              />
            )}
          </div>
        ))}
        <div className="flex justify-end gap-2.5 pt-2">
          <button onClick={onClose} className="rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">Cancelar</button>
          <button onClick={save} disabled={saving} className="rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}
