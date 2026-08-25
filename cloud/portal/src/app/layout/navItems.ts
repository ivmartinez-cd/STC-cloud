import {
  LayoutDashboard, Users, Settings, Shield, Bell, FileText, History, UserCheck, Droplets, AlertOctagon,
  CalendarClock, PackageSearch, MailCheck, Radio, Printer,
} from 'lucide-react';
import type { NavEntry } from './navTree';

// `roles` ausente = visible para cualquier rol autenticado. "Agentes" expone
// inventario/config de monitores de TODOS los clientes vistos por ese rol — no
// tiene sentido para un client_viewer (que además el backend le deniega esas
// rutas con 403).
//
// Agrupado en sub-niveles (Fase de UX 2026-08-24, mismo criterio que HP SDS)
// — para agregar un ítem nuevo: si encaja en un grupo existente, sumalo a su
// `children`; si es un destino de primer nivel nuevo (poco frecuente), agregá
// un `NavLeaf` suelto al array.
export const NAV_TREE: NavEntry[] = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  {
    name: 'Gestión de Clientes', icon: Users,
    children: [
      { name: 'Clientes', path: '/clients', icon: Users },
      { name: 'Dispositivos', path: '/devices', icon: Printer },
      { name: 'Pendientes', path: '/pending', icon: UserCheck, roles: ['admin', 'operator'], badgeKey: 'pending' },
    ],
  },
  {
    name: 'Gestión de Agentes', icon: Shield, roles: ['admin', 'operator'],
    children: [
      { name: 'Agentes', path: '/agents', icon: Shield, roles: ['admin', 'operator'] },
      { name: 'Acciones', path: '/remote-actions', icon: Radio, roles: ['admin', 'operator'] },
    ],
  },
  {
    name: 'Gestión de Consumibles', icon: Droplets,
    children: [
      { name: 'Consumibles', path: '/supplies', icon: Droplets },
      { name: 'Pedidos', path: '/supply-requests', icon: PackageSearch },
    ],
  },
  {
    name: 'Gestión de Incidencias', icon: AlertOctagon,
    children: [
      { name: 'Incidentes', path: '/incidents', icon: AlertOctagon },
      { name: 'Alertas', path: '/alerts', icon: Bell },
    ],
  },
  {
    name: 'Informes', icon: FileText,
    children: [
      { name: 'Reportes', path: '/reports', icon: FileText },
      { name: 'Informes Programados', path: '/scheduled-reports', icon: CalendarClock, roles: ['admin', 'operator'] },
    ],
  },
  {
    name: 'Administración', icon: History, roles: ['admin', 'operator'],
    children: [
      { name: 'Movimientos', path: '/activity', icon: History, roles: ['admin', 'operator'] },
      { name: 'Correo', path: '/email-log', icon: MailCheck, roles: ['admin', 'operator'] },
    ],
  },
  { name: 'Configuración', path: '/settings', icon: Settings },
];

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  client_viewer: 'Cliente',
};
