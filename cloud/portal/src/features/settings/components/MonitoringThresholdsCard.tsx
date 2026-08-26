import EstadoChip from '../../../shared/components/EstadoChip';
import ThresholdSlider from '../../../shared/components/ThresholdSlider';
import { fmt } from '../../../shared/lib/formatters';
import type { SettingsImpact } from '../types/settings';
import type { SettingsDraft } from '../hooks/useSystemSettingsForm';

function agentHelp(impact: SettingsImpact | null, minutes: number): string {
  if (!impact) return `Con el valor actual, agentes sin heartbeat hace más de ${minutes} min quedan marcados sin señal.`;
  return `Con el valor actual, ${fmt(impact.agentOffline.affected)} de ${fmt(impact.agentOffline.total)} monitores quedan marcados sin señal. Subilo si los agentes reportan cada más de ${minutes} minutos.`;
}

function deviceHelp(impact: SettingsImpact | null): string {
  if (!impact) return 'Genera alertas de device_offline para equipos sin lecturas recientes.';
  return `Genera ${fmt(impact.deviceOffline.affected)} alertas de device_offline. Los equipos apagados de noche vuelven a alertar cada mañana.`;
}

interface Props {
  draft: SettingsDraft;
  impact: SettingsImpact | null;
  disabled: boolean;
  onChange: (patch: Partial<SettingsDraft>) => void;
}

function CardHeader() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-150 px-5 py-[14px]">
      <div>
        <div className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">MONITOREO DE ESTADO</div>
        <div className="mt-[5px] font-sans text-[11.5px] text-ink-300">Cuánto silencio hace falta para considerar algo caído</div>
      </div>
      <EstadoChip label="ACTIVO" variant="neutral" />
    </div>
  );
}

function Sliders({ draft, impact, disabled, onChange }: Props) {
  return (
    <div className="space-y-[22px] px-5 py-[18px]">
      <ThresholdSlider
        label="MONITOR SIN SEÑAL" value={draft.agentOfflineThresholdMinutes} min={1} max={1440} unit=" min" disabled={disabled}
        helpText={agentHelp(impact, draft.agentOfflineThresholdMinutes)}
        onChange={(v) => onChange({ agentOfflineThresholdMinutes: v })}
      />
      <ThresholdSlider
        label="EQUIPO SIN SEÑAL" value={draft.deviceOfflineThresholdMinutes} min={1} max={1440} unit=" min" accent="severe" disabled={disabled}
        helpText={deviceHelp(impact)}
        onChange={(v) => onChange({ deviceOfflineThresholdMinutes: v })}
      />
    </div>
  );
}

/** "Monitoreo de estado" (handoff hifi #3, fase 2, 26/08/2026) — reemplaza
 * `MonitorThresholdCard.tsx`: sliders con impacto real en vivo en vez de
 * inputs numéricos pelados. Umbral de equipo en HORAS en el mockup, pero el
 * backend guarda minutos (`system_settings.device_offline_threshold_minutes`,
 * rango 1-1440) — el slider expone minutos con el mismo rango, `ThresholdSlider`
 * no asume una unidad. */
export default function MonitoringThresholdsCard(props: Props) {
  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 bg-white">
      <CardHeader />
      <Sliders {...props} />
    </div>
  );
}
