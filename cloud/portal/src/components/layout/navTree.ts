import type { ElementType } from 'react';

export interface NavLeaf {
  name: string;
  path: string;
  icon: ElementType;
  roles?: string[];
  /** Único badge dinámico hoy: el contador de equipos pendientes de aprobación. */
  badgeKey?: 'pending';
}

export interface NavGroup {
  name: string;
  icon: ElementType;
  roles?: string[];
  children: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

function visibleForRole(roles: string[] | undefined, role: string): boolean {
  return !roles || roles.includes(role);
}

/** Filtra por rol recursivamente — un grupo cuyos hijos quedan todos afuera desaparece entero. */
export function filterNavTreeByRole(tree: NavEntry[], role: string): NavEntry[] {
  const out: NavEntry[] = [];
  for (const entry of tree) {
    if (!visibleForRole(entry.roles, role)) continue;
    if (isNavGroup(entry)) {
      const children = entry.children.filter((c) => visibleForRole(c.roles, role));
      if (children.length === 0) continue;
      out.push({ ...entry, children });
    } else {
      out.push(entry);
    }
  }
  return out;
}
