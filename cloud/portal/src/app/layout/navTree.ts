import type { ElementType } from 'react';

/** Claves de los contadores dinámicos que puede llevar un ítem — ver `useNavBadges`. */
export type BadgeKey = 'alerts' | 'incidents' | 'supplyRequests' | 'pending' | 'agentsOffline';

export interface NavItem {
  name: string;
  path: string;
  icon: ElementType;
  roles?: string[];
  badgeKey?: BadgeKey;
  /** Ítem del handoff sin pantalla real todavía (Facturación) — se muestra sin link. */
  disabled?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

function visibleForRole(roles: string[] | undefined, role: string): boolean {
  return !roles || roles.includes(role);
}

/** Filtra por rol — una sección cuyos ítems quedan todos afuera desaparece entera. */
export function filterNavByRole(sections: NavSection[], role: string): NavSection[] {
  const out: NavSection[] = [];
  for (const section of sections) {
    const items = section.items.filter((i) => visibleForRole(i.roles, role));
    if (items.length === 0) continue;
    out.push({ ...section, items });
  }
  return out;
}
