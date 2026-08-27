export type SettingsTab = 'monitoreo' | 'correo' | 'operadores' | 'incidentes' | 'seguridad' | 'feedback';

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'monitoreo';

interface SettingsTabDef { id: SettingsTab; label: string; adminOnly: boolean }

/** Orden y visibilidad de las tabs de Configuración (27/08/2026, "cada
 * pantalla entra en el viewport sin scroll"): antes eran 8+ tarjetas
 * apiladas que desbordaban ~1700 px; ahora cada grupo vive en su tab. */
export const SETTINGS_TABS: SettingsTabDef[] = [
  { id: 'monitoreo', label: 'Monitoreo', adminOnly: false },
  { id: 'correo', label: 'Correo', adminOnly: false },
  { id: 'operadores', label: 'Operadores', adminOnly: true },
  { id: 'incidentes', label: 'Incidentes', adminOnly: true },
  { id: 'seguridad', label: 'Seguridad', adminOnly: false },
  { id: 'feedback', label: 'Feedback', adminOnly: true },
];

/** `#id` de deep-links externos → tab que contiene ese elemento. Reemplaza
 * el `scrollIntoView` de antes: con tabs no hay a dónde scrollear, hay que
 * activar la tab correcta ("VER REGLA" en Incidentes, "RESOLVER AHORA"). */
const HASH_TO_TAB: Record<string, SettingsTab> = {
  'global-incident-rules': 'incidentes',
  'smtp-card': 'correo',
};

export function visibleSettingsTabs(isAdmin: boolean): SettingsTabDef[] {
  return SETTINGS_TABS.filter((t) => isAdmin || !t.adminOnly);
}

/** Valida `?tab=` — un valor desconocido o de sólo-admin para un operador cae al default. */
export function parseSettingsTab(value: string | null, isAdmin: boolean): SettingsTab {
  const found = visibleSettingsTabs(isAdmin).find((t) => t.id === value);
  return found ? found.id : DEFAULT_SETTINGS_TAB;
}

export function tabForHash(hash: string, isAdmin: boolean): SettingsTab | null {
  const tab = HASH_TO_TAB[hash.replace(/^#/, '')];
  if (!tab) return null;
  return parseSettingsTab(tab, isAdmin);
}
