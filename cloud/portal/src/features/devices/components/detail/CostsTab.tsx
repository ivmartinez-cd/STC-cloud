import { useState, useEffect, useCallback } from 'react';
import { Coins, Loader2, Save } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import { api } from '../../../../shared/lib/api';
import { useToast } from '../../../../store/ToastContext';

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
    <Card className="max-w-xl">
      <CardTitle
        icon={<Coins size={16} />}
        right={
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-[3px] bg-brand px-3.5 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
          </button>
        }
      >
        Costes
      </CardTitle>
      <div className="px-5 pb-2 pt-3.5">
        <p className="mb-2 font-sans text-[12px] leading-[1.5] text-ink-400">
          Los costes por página alimentan las columnas de facturación del informe de uso programado.
        </p>
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-4 border-b border-line-200 py-[9px]">
            <span className="font-montserrat text-[8.5px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{f.label}</span>
            <input type="number" min={0} step={f.step} value={(costs[f.key] as number | null) ?? ''}
              onChange={(e) => setField(f.key, e.target.value)}
              className="w-32 rounded-[3px] border border-line-300 bg-white px-2.5 py-1.5 text-right font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand" />
          </label>
        ))}
        <label className="flex items-center justify-between gap-4 py-[9px]">
          <span className="font-montserrat text-[8.5px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">Moneda</span>
          <input value={costs.currency} maxLength={3}
            onChange={(e) => setCosts({ ...costs, currency: e.target.value.toUpperCase() })}
            className="w-32 rounded-[3px] border border-line-300 bg-white px-2.5 py-1.5 text-right font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand" />
        </label>
      </div>
    </Card>
  );
}
