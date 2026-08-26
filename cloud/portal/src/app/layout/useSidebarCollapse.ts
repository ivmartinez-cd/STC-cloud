import { useState, useEffect } from 'react';

const STORAGE_KEY = 'stc-sidebar-collapsed';

function readStored(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

/**
 * Colapsado/expandido del riel (handoff hifi "Sidebar", 26/08/2026) — ya no
 * es hover, es un control explícito que "persiste por usuario". Por debajo de
 * 1024px la barra colapsa sola sin importar la preferencia guardada (el
 * drawer de <768px lo maneja `Layout` aparte, con `isMobileMenuOpen`).
 */
export function useSidebarCollapse() {
  const [manualCollapsed, setManualCollapsed] = useState(readStored);
  const [forceCollapsed, setForceCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setForceCollapsed(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    setManualCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* localStorage puede no estar disponible */ }
      return next;
    });
  };

  return { collapsed: forceCollapsed || manualCollapsed, toggle };
}
