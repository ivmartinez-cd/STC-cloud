import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { DEFAULT_SETTINGS_TAB, parseSettingsTab, tabForHash, type SettingsTab } from '../lib/settingsTabs';

/** Si el hash cambia con la pantalla ya montada (navegar Incidentes →
 * Configuración estando en Configuración), también activa la tab. */
function useHashToTab(hash: string, isAdmin: boolean, setTab: (t: SettingsTab) => void) {
  useEffect(() => {
    const mapped = tabForHash(hash, isAdmin);
    if (mapped) setTab(mapped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, isAdmin]);
}

/** Tab activa reflejada en `?tab=` — mismo patrón que `ClientDetail.tsx`.
 * Un `#id` en la URL (deep-link "VER REGLA" desde Incidentes) gana sobre
 * `?tab=`: se traduce a la tab que contiene ese elemento, sin scroll. */
export function useSettingsTab(isAdmin: boolean) {
  const { hash } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState<SettingsTab>(
    () => tabForHash(hash, isAdmin) ?? parseSettingsTab(searchParams.get('tab'), isAdmin),
  );

  const setTab = useCallback((next: SettingsTab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams);
    if (next === DEFAULT_SETTINGS_TAB) params.delete('tab'); else params.set('tab', next);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useHashToTab(hash, isAdmin, setTab);
  return { tab, setTab };
}
