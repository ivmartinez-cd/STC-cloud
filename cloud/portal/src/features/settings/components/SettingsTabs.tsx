import DetailTabs from '../../../shared/components/DetailTabs';
import { visibleSettingsTabs, type SettingsTab } from '../lib/settingsTabs';

/** Tarjeta blanca con la tablist de Configuración (27/08/2026) — debajo del
 * header y del banner de bloqueantes, que persisten en todas las tabs. Las
 * tabs de sólo-admin (operadores, incidentes, feedback) no se muestran a
 * operadores: sus tarjetas ya eran admin-only antes de la conversión. */
export default function SettingsTabs({ active, isAdmin, onChange }: { active: SettingsTab; isAdmin: boolean; onChange: (tab: SettingsTab) => void }) {
  return (
    <div className="mb-4 rounded-[5px] border border-line-100 bg-white">
      <DetailTabs tabs={visibleSettingsTabs(isAdmin)} active={active} onChange={onChange} />
    </div>
  );
}
