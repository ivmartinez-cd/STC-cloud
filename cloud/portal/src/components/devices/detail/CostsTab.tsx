import { useState, useEffect, useCallback } from 'react';
import { Coins, Loader2, Save } from 'lucide-react';
import { api } from '../../../lib/api';
import { useToast } from '../../../context/ToastContext';

interface DeviceCosts {
  capital_cost: number | null;
  quarterly_rental: number | null;
  mono_page_cost: number | null;
  color_page_cost: number | null;
  service_contract_cost: number | null;
  service_contract_years: number | null;
  currency: string;
  updated_at: string | null;
}

const FIELDS: { key: keyof DeviceCosts; label: string; step: string }[] = [
  { key: 'capital_cost', label: 'Coste de capital', step: '0.01' },
  { key: 'quarterly_rental', label: 'Alquiler trimestral', step: '0.01' },
  { key: 'mono_page_cost', label: 'Coste página monocromática', step: '0.0001' },
  { key: 'color_page_cost', label: 'Coste página a color', step: '0.0001' },
  { key: 'service_contract_cost', label: 'Coste del contrato de servicios', step: '0.01' },
  { key: 'service_contract_years', label: 'Duración del contrato (años)', step: '1' },
];

/**
 * Pestaña "Costes" de la ficha del equipo (Fase 4.5 del gap analysis vs HP
 * SDS). Los costes por página alimentan las columnas de billing figures del
 * informe de uso programado. Solo admin/operator (la pestaña ya viene
 * gateada desde DeviceDetail).
 */
export default function CostsTab({ deviceId }: { deviceId: string }) {
  const { showToast } = useToast();
  const [costs, setCosts] = useState<DeviceCosts | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<DeviceCosts>(`/devices/${deviceId}/costs`).then(setCosts).catch(() => setCosts(null));
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  const setField = (key: keyof DeviceCosts, raw: string) => {
    if (!costs) return;
    setCosts({ ...costs, [key]: raw === '' ? null : Number(raw) });
  };

  const save = async () => {
    if (!costs) return;
    setSaving(true);
    try {
      await api.put(`/devices/${deviceId}/costs`, {
        capital_cost: costs.capital_cost, quarterly_rental: costs.quarterly_rental,
        mono_page_cost: costs.mono_page_cost, color_page_cost: costs.color_page_cost,
        service_contract_cost: costs.service_contract_cost,
        service_contract_years: costs.service_contract_years,
        currency: costs.currency,
      });
      showToast('Costes del equipo actualizados', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!costs) {
    return <div className="py-12 flex justify-center"><Loader2 size={24} className="text-brand animate-spin" /></div>;
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-8 max-w-xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-black text-[#1a2333] tracking-tight flex items-center gap-3">
          <div className="p-2 bg-brand/10 text-brand rounded-xl"><Coins size={18} /></div>
          Costes
        </h3>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </div>
      <p className="text-xs text-slate-500 font-medium mb-5">
        Los costes por página alimentan las columnas de facturación del informe de uso programado.
      </p>
      <div className="space-y-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-4 text-xs font-bold text-slate-600">
            {f.label}
            <input type="number" min={0} step={f.step} value={(costs[f.key] as number | null) ?? ''}
              onChange={(e) => setField(f.key, e.target.value)}
              className="w-36 bg-slate-50 text-slate-700 text-sm font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand text-right" />
          </label>
        ))}
        <label className="flex items-center justify-between gap-4 text-xs font-bold text-slate-600">
          Moneda
          <input value={costs.currency} maxLength={3}
            onChange={(e) => setCosts({ ...costs, currency: e.target.value.toUpperCase() })}
            className="w-36 bg-slate-50 text-slate-700 text-sm font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand text-right" />
        </label>
      </div>
    </div>
  );
}
