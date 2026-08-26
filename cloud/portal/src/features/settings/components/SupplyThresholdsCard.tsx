import EstadoChip from '../../../shared/components/EstadoChip';
import ThresholdSlider from '../../../shared/components/ThresholdSlider';
import { fmt } from '../../../shared/lib/formatters';
import type { SettingsImpact } from '../types/settings';
import type { SettingsDraft } from '../hooks/useSystemSettingsForm';

function warningHelp(impact: SettingsImpact | null): string {
  if (!impact) return 'Ítems por debajo de este nivel hoy.';
  return `${fmt(impact.supplyWarning.affected)} ítems por debajo de este nivel hoy.`;
}

function criticalHelp(impact: SettingsImpact | null): string {
  if (!impact) return 'Ítems críticos generarían pedido al activarse.';
  return `${fmt(impact.supplyCritical.affected)} ítems críticos generarían pedido al activarse.`;
}

interface Props {
  draft: SettingsDraft;
  impact: SettingsImpact | null;
  disabled: boolean;
  onChange: (patch: Partial<SettingsDraft>) => void;
}

/** "Umbrales globales de consumible" (handoff hifi #3, fase 2, 26/08/2026) —
 * el mockup lo describe como "valor por defecto para clientes sin umbral
 * propio", pero `clients.supply_request_threshold_pct` NO es nullable hoy:
 * cada cliente ya tiene un valor propio desde que se crea (hardcodeado a 10
 * en la migración `20260824110000_supply_requests.ts`), así que no hay
 * cliente "sin umbral propio" al que este ajuste global pueda aplicarle
 * como fallback. Queda guardado y con impacto visible (para dimensionar el
 * cambio antes de decidir), pero **todavía no está conectado** a ningún
 * comportamiento real — ni como default de alta de cliente nuevo ni como
 * fallback. Conectarlo requiere tocar `CreateClientUseCase`
 * (`modules/clients/application/use-cases/client-use-cases.ts`), deliberadamente
 * diferido para no ampliar el radio de esta fase. */
function CardHeader() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-150 px-5 py-[14px]">
      <div>
        <div className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">UMBRALES GLOBALES DE CONSUMIBLE</div>
        <div className="mt-[5px] font-sans text-[11.5px] text-ink-300">Valor por defecto para clientes sin umbral propio</div>
      </div>
      <EstadoChip label="ACTIVO" variant="neutral" />
    </div>
  );
}

function ManualReviewCheckbox({ draft, disabled, onChange }: Props) {
  return (
    <label className="flex items-center gap-[9px] border-t border-line-200 pt-[15px]">
      <input
        type="checkbox" checked={draft.supplyManualReviewRequired} disabled={disabled}
        onChange={(e) => onChange({ supplyManualReviewRequired: e.target.checked })}
        className="h-[15px] w-[15px] rounded-[2px] accent-brand"
      />
      <span className="font-sans text-[12.5px] text-ink-100">Requerir revisión manual antes de enviar el pedido al proveedor</span>
    </label>
  );
}

function Sliders({ draft, impact, disabled, onChange }: Props) {
  return (
    <div className="px-5 py-[18px]">
      <div className="mb-[22px]">
        <ThresholdSlider
          label="ADVERTENCIA · NIVEL BAJO" value={draft.supplyThresholdWarningPct} min={1} max={99} disabled={disabled}
          helpText={warningHelp(impact)} onChange={(v) => onChange({ supplyThresholdWarningPct: v })}
        />
      </div>
      <div className="mb-[18px]">
        <ThresholdSlider
          label="CRÍTICO · PEDIDO AUTOMÁTICO" value={draft.supplyThresholdCriticalPct} min={1} max={99} accent="severe" disabled={disabled}
          helpText={criticalHelp(impact)} onChange={(v) => onChange({ supplyThresholdCriticalPct: v })}
        />
      </div>
      <ManualReviewCheckbox draft={draft} impact={impact} disabled={disabled} onChange={onChange} />
    </div>
  );
}

export default function SupplyThresholdsCard(props: Props) {
  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 bg-white">
      <CardHeader />
      <Sliders {...props} />
    </div>
  );
}
