import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../store/AuthContext';
import PageHeader from '../../../shared/components/PageHeader';
import { BTN_PRIMARY_LG, BTN_SECONDARY_LG } from '../../../shared/lib/buttons';
import ZoneLabel from '../../../shared/components/ZoneLabel';
import { useSystemSettingsForm } from '../hooks/useSystemSettingsForm';
import SettingsBlockersBanner from '../components/SettingsBlockersBanner';
import MonitoringThresholdsCard from '../components/MonitoringThresholdsCard';
import SmtpCard from '../components/SmtpCard';
import AutomationCard from '../components/AutomationCard';
import SupplyThresholdsCard from '../components/SupplyThresholdsCard';
import OperatorsCard from '../components/operators/OperatorsCard';
import FeedbackCard from '../components/FeedbackCard';
import MessageTemplatesCard from '../components/MessageTemplatesCard';
import TwoFactorCard from '../components/TwoFactorCard';
import GlobalIncidentRulesCard from '../components/GlobalIncidentRulesCard';

/**
 * Configuración del sistema (handoff hifi #3, fase 2, 26/08/2026) — reemplaza
 * el layout de una columna centrada (`max-w-5xl`) por dos columnas a todo el
 * ancho. SMTP y umbrales pasan de sólo-lectura/`localStorage` a ajustes reales
 * en `system_settings` (`GET/PUT /settings/system`, `GET .../impact`,
 * `POST .../smtp/test`). "Automatización de datos faltantes" y el alcance
 * multi-cliente por operador quedan fuera de esta fase — son features de
 * producto completas, no rediseño (ver `AutomationCard.tsx`).
 */
/** Deep-link desde "VER REGLA" (banner de Incidentes) — sin esto, aterrizar
 * en Configuración no muestra dónde mirar entre 8+ tarjetas. Reintenta unas
 * veces: `OperatorsCard` (arriba en el DOM) hace su propio fetch async y
 * puede inflar la altura de la página DESPUÉS de que `loading` ya bajó acá,
 * invalidando un scroll hecho una sola vez. */
function useScrollToHashTarget(loading: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (loading || !hash) return;
    const id = hash.slice(1);
    let tries = 0;
    const attempt = () => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (++tries < 6) setTimeout(attempt, 350);
    };
    attempt();
  }, [loading, hash]);
}

export default function Settings() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const s = useSystemSettingsForm();
  useScrollToHashTarget(s.loading || !s.draft);

  if (s.loading || !s.draft) {
    return <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10"><div className="h-[200px] animate-pulse rounded-[5px] bg-white" /></div>;
  }

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10">
      <PageHeader
        eyebrow="UMBRALES · AVISOS · PARÁMETROS GLOBALES · OPERADORES" title="Configuración del sistema"
        subtitle="Aplica a toda la red salvo donde un cliente tenga valores propios"
        actions={isAdmin ? (
          <>
            {s.isDirty && <button type="button" onClick={s.discard} disabled={s.saving} className={BTN_SECONDARY_LG}>DESCARTAR</button>}
            <button type="button" onClick={() => void s.save()} disabled={s.saving || !s.isDirty} className={BTN_PRIMARY_LG}>{s.saving ? 'GUARDANDO…' : 'GUARDAR CAMBIOS'}</button>
          </>
        ) : undefined}
      />

      <SettingsBlockersBanner smtpConfigured={!!s.view?.smtp_host} />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MonitoringThresholdsCard draft={s.draft} impact={s.impact} disabled={!isAdmin} onChange={s.update} />
        <SmtpCard s={s} disabled={!isAdmin} />
      </div>
      <div className="mb-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AutomationCard />
        <SupplyThresholdsCard draft={s.draft} impact={s.impact} disabled={!isAdmin} onChange={s.update} />
      </div>

      <OperatorsCard />

      <ZoneLabel text="OTRAS CONFIGURACIONES" lineColorClass="bg-brand-gray" />
      <div className="mt-3.5 space-y-4">
        {isAdmin && <GlobalIncidentRulesCard />}
        <TwoFactorCard />
        {isAdmin && <MessageTemplatesCard />}
        {isAdmin && <FeedbackCard />}
      </div>
    </div>
  );
}
