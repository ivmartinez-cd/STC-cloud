import type { SettingsDraft, SystemSettingsFormState } from '../hooks/useSystemSettingsForm';
import type { SettingsTab } from '../lib/settingsTabs';
import MonitoringThresholdsCard from './MonitoringThresholdsCard';
import SmtpCard from './SmtpCard';
import AutomationCard from './AutomationCard';
import SupplyThresholdsCard from './SupplyThresholdsCard';
import OperatorsCard from './operators/OperatorsCard';
import FeedbackCard from './FeedbackCard';
import MessageTemplatesCard from './MessageTemplatesCard';
import TwoFactorCard from './TwoFactorCard';
import GlobalIncidentRulesCard from './GlobalIncidentRulesCard';

type FormWithDraft = SystemSettingsFormState & { draft: SettingsDraft };

interface Props { tab: SettingsTab; s: FormWithDraft; isAdmin: boolean }

function MonitoringPanel({ s, isAdmin }: Omit<Props, 'tab'>) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
      <MonitoringThresholdsCard draft={s.draft} impact={s.impact} disabled={!isAdmin} onChange={s.update} />
      <SupplyThresholdsCard draft={s.draft} impact={s.impact} disabled={!isAdmin} onChange={s.update} />
      <AutomationCard />
    </div>
  );
}

function MailPanel({ s, isAdmin }: Omit<Props, 'tab'>) {
  return (
    <div className={`grid min-h-0 flex-1 grid-cols-1 gap-4 ${isAdmin ? 'lg:grid-cols-2' : ''}`}>
      <SmtpCard s={s} disabled={!isAdmin} />
      {isAdmin && <MessageTemplatesCard />}
    </div>
  );
}

/** Contenido de la tab activa de Configuración (27/08/2026). El form global
 * (`useSystemSettingsForm`) vive en la página: GUARDAR/DESCARTAR del header
 * aplican a umbrales + SMTP sin importar qué tab esté visible. Las tarjetas
 * con fetch propio (operadores, reglas, 2FA, plantillas, feedback) se montan
 * recién al entrar a su tab — mismo criterio que `ClientDetail.tsx`. */
export default function SettingsTabPanels({ tab, s, isAdmin }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {tab === 'monitoreo' && <MonitoringPanel s={s} isAdmin={isAdmin} />}
      {tab === 'correo' && <MailPanel s={s} isAdmin={isAdmin} />}
      {tab === 'operadores' && isAdmin && <OperatorsCard />}
      {tab === 'incidentes' && isAdmin && <GlobalIncidentRulesCard />}
      {tab === 'seguridad' && <TwoFactorCard />}
      {tab === 'feedback' && isAdmin && <FeedbackCard />}
    </div>
  );
}
