import {
  LayoutDashboard, Bell, AlertOctagon, PackageSearch, Radio, Users, Printer, UserCheck, Droplets,
  Router, FileText, CalendarClock, Receipt, History, MailCheck, Settings,
} from 'lucide-react';
import type { NavSection } from './navTree';

// Handoff hifi "Sidebar" (26/08/2026): tres secciones fijas — OPERACIÓN (lo que
// se atiende hoy), INVENTARIO (lo que se administra) y ADMINISTRACIÓN (lo que
// se consulta) — reemplazan el único rótulo "Navegación" sobre una lista plana.
// El vocabulario sigue el de las pantallas ya rediseñadas (p. ej. "Agentes" es
// hoy "Salud de nodos", ver docblock de `features/monitors/pages/Agents.tsx`).
//
// El handoff no lista "Informes Programados" entre los ítems de ADMINISTRACIÓN
// (sólo Informes/Facturación/Movimientos/Correo/Configuración), pero esa
// pantalla (`/scheduled-reports`) no tiene otra entrada en la app — se agrega
// igual para no perder acceso a una función real.
//
// "Facturación" no tiene pantalla propia todavía (sólo un tab de costos en
// Dispositivo Detalle y datos de costos en Reportes) — se muestra `disabled`
// (placeholder del diseño) hasta que exista una ruta real.
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'OPERACIÓN',
    items: [
      { name: 'Panel de control', path: '/', icon: LayoutDashboard },
      { name: 'Alertas', path: '/alerts', icon: Bell, badgeKey: 'alerts' },
      { name: 'Incidentes', path: '/incidents', icon: AlertOctagon, badgeKey: 'incidents' },
      { name: 'Pedidos', path: '/supply-requests', icon: PackageSearch, badgeKey: 'supplyRequests' },
      { name: 'Acciones remotas', path: '/remote-actions', icon: Radio, roles: ['admin', 'operator'] },
    ],
  },
  {
    title: 'INVENTARIO',
    items: [
      { name: 'Clientes', path: '/clients', icon: Users },
      { name: 'Dispositivos', path: '/devices', icon: Printer },
      { name: 'Pendientes de alta', path: '/pending', icon: UserCheck, roles: ['admin', 'operator'], badgeKey: 'pending' },
      { name: 'Consumibles', path: '/supplies', icon: Droplets },
      { name: 'Salud de nodos', path: '/agents', icon: Router, roles: ['admin', 'operator'], badgeKey: 'agentsOffline' },
    ],
  },
  {
    title: 'ADMINISTRACIÓN',
    items: [
      { name: 'Informes', path: '/reports', icon: FileText },
      { name: 'Informes Programados', path: '/scheduled-reports', icon: CalendarClock, roles: ['admin', 'operator'] },
      { name: 'Facturación', path: '/billing', icon: Receipt, disabled: true },
      { name: 'Movimientos', path: '/activity', icon: History, roles: ['admin', 'operator'] },
      { name: 'Correo', path: '/email-log', icon: MailCheck, roles: ['admin', 'operator'] },
      { name: 'Configuración', path: '/settings', icon: Settings },
    ],
  },
];

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  client_viewer: 'Cliente',
};
