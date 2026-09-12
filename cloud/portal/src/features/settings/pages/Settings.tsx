import { useAuth } from '../../../store/AuthContext';
import PageHeader from '../../../shared/components/PageHeader';
import { BTN_PRIMARY_LG, BTN_SECONDARY_LG } from '../../../shared/lib/buttons';
import { useSystemSettingsForm, type SettingsDraft, type SystemSettingsFormState } from '../hooks/useSystemSettingsForm';
import { useSettingsTab } from '../hooks/useSettingsTab';
import SettingsBlockersBanner from '../components/SettingsBlockersBanner';
import SettingsTabs from '../components/SettingsTabs';
import SettingsTabPanels from '../components/SettingsTabPanels';
import TwoFactorCard from '../components/TwoFactorCard';

const ROOT_CLS = '-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0';

function HeaderActions({ s }: { s: SystemSettingsFormState }) {
  return (
    <>
      {s.isDirty && <button type="button" onClick={s.discard} disabled={s.saving} className={BTN_SECONDARY_LG}>DESCARTAR</button>}
      <button type="button" onClick={() => void s.save()} disabled={s.saving || !s.isDirty} className={BTN_PRIMARY_LG}>{s.saving ? 'GUARDANDO…' : 'GUARDAR CAMBIOS'}</button>
    </>
  );
}

/**
 * Configuración del sistema (handoff hifi #3, fase 2, 26/08/2026): SMTP y
 * umbrales son ajustes reales en `system_settings` (`GET/PUT /settings/system`,
 * `GET .../impact`, `POST .../smtp/test`). "Automatización de datos faltantes"
 * y el alcance multi-cliente por operador quedan fuera — son features de
 * producto completas, no rediseño (ver `AutomationCard.tsx`).
 *
 * 27/08/2026 ("cada pantalla entra en el viewport sin scroll"): las 8+
 * tarjetas apiladas (~1700 px de desborde a 1080p) pasan a tabs con `?tab=`
 * (`useSettingsTab`); header, banner y GUARDAR/DESCARTAR persisten arriba.
 * El deep-link `#global-incident-rules` ("VER REGLA" en Incidentes) ya no
 * scrollea: activa la tab Incidentes (`lib/settingsTabs.ts`).
 */
export default function Settings() {
  const { role } = useAuth();
  // Un `client_viewer` no puede leer `GET /settings/system` (ver `rolePolicy.ts`):
  // pedirlo devolvía 403, tiraba un toast de error y dejaba la pantalla en el
  // esqueleto de carga para siempre, porque `draft` nunca llegaba. Lo único que el
  // backend sí le permite acá es la 2FA de su propia cuenta, así que esa es su
  // pantalla entera — sin tablist de una sola pestaña (verificado con el usuario
  // real del cliente ISSN, 12/09/2026).
  return role === 'client_viewer' ? <AccountSecuritySettings /> : <SystemSettings isAdmin={role === 'admin'} />;
}

/** Configuración para un cliente: sólo la seguridad de su propia cuenta. */
function AccountSecuritySettings() {
  return (
    <div className={ROOT_CLS}>
      <PageHeader
        eyebrow="SEGURIDAD DE LA CUENTA" title="Configuración"
        subtitle="Verificación en dos pasos para proteger el acceso a tus equipos"
      />
      <TwoFactorCard />
    </div>
  );
}

function SystemSettings({ isAdmin }: { isAdmin: boolean }) {
  const s = useSystemSettingsForm();
  const { tab, setTab } = useSettingsTab(isAdmin);

  if (s.loading || !s.draft) return <div className={ROOT_CLS}><div className="h-[200px] animate-pulse rounded-[5px] bg-white" /></div>;

  return (
    <div className={ROOT_CLS}>
      <PageHeader
        eyebrow="UMBRALES · AVISOS · PARÁMETROS GLOBALES · OPERADORES" title="Configuración del sistema"
        subtitle="Aplica a toda la red salvo donde un cliente tenga valores propios"
        actions={isAdmin ? <HeaderActions s={s} /> : undefined}
      />
      <SettingsBlockersBanner smtpConfigured={!!s.view?.smtp_host} onResolve={() => setTab('correo')} />
      <SettingsTabs active={tab} isAdmin={isAdmin} onChange={setTab} />
      <SettingsTabPanels tab={tab} s={s as SystemSettingsFormState & { draft: SettingsDraft }} isAdmin={isAdmin} />
    </div>
  );
}
