import type { DBUser } from '../types/settings';

/** Etiquetas de rol (handoff hifi #3, fase 2, 26/08/2026) — el mockup muestra
 * "ADMIN DE CLIENTE"/"SOLO LECTURA" como si hubiera roles intermedios, pero el
 * RBAC real sólo tiene 3 (`rolePolicy.ts`): admin/operator/client_viewer. Se
 * mapean a las etiquetas más cercanas del mockup sin inventar un rol que no
 * existe — el alcance multi-cliente por operador queda fuera de esta fase. */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'ADMIN GENERAL',
  operator: 'OPERADOR',
  client_viewer: 'SOLO LECTURA',
};

export function roleDotClass(role: string): string {
  if (role === 'admin') return 'bg-brand';
  if (role === 'client_viewer') return 'bg-ink-200';
  return 'bg-brand-gray';
}

/** admin/operator ven toda la red (sin alcance multi-cliente todavía);
 * client_viewer está atado a un único cliente — `Sin alcance asignado` si por
 * algún motivo no lo tiene, coloreado como bloqueante (nunca debería pasar,
 * la CHECK de la migración lo exige, pero la UI no debe asumirlo). */
export function scopeOf(user: DBUser): { text: string; blocked: boolean } {
  if (user.role === 'client_viewer') {
    return user.client_name ? { text: user.client_name, blocked: false } : { text: 'Sin alcance asignado', blocked: true };
  }
  return { text: 'Toda la red', blocked: false };
}

export function operatorsBreakdown(users: DBUser[]): string {
  const admins = users.filter((u) => u.role === 'admin').length;
  const suspended = users.filter((u) => !u.active).length;
  const scoped = users.length - admins - suspended;
  return `${users.length} operador${users.length === 1 ? '' : 'es'} · ${admins} administrador general, ${scoped} con alcance limitado, ${suspended} suspendido${suspended === 1 ? '' : 's'}`;
}
