import React, { useState, useEffect, useCallback } from 'react';
import { useNow } from '../hooks/useNow';
import { Link } from 'react-router-dom';
import {
  HardDrive, Activity, Radio, Users, ChevronRight,
  WifiOff, BarChart3, PieChart as PieChartIcon,
  Plus, FileText, Settings, ShieldAlert, Cpu, ArrowUpRight, Building2,
  AlertTriangle, ShieldCheck
} from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { api } from '../lib/api';
import type { Alert } from '../types/alerts';


// Paleta institucional (Manual de marca Canal Directo): naranja + gris MPS.
// Nunca colores de otras líneas de servicio (violeta DaaS, magenta Digitalización, celeste Signage).
const BRAND_COLORS = ['#f7941d', '#58595b', '#1abc9c', '#f1c40f', '#232323', '#e74c3c'];

// Tailwind necesita ver las clases completas de forma literal para generarlas —
// `bg-${color}-50` como template string no lo detecta el scanner. Por eso el mapa.
const STAT_COLOR_VARIANTS = {
  charcoal: { glow: 'bg-brand-charcoal/5 group-hover:bg-brand-charcoal/10', iconBg: 'bg-brand-charcoal/10 text-brand-charcoal' },
  emerald: { glow: 'bg-emerald-500/5 group-hover:bg-emerald-500/10', iconBg: 'bg-emerald-50 text-emerald-600' },
  gray: { glow: 'bg-brand-gray/5 group-hover:bg-brand-gray/10', iconBg: 'bg-brand-gray/10 text-brand-gray' },
  orange: { glow: 'bg-brand/5 group-hover:bg-brand/10', iconBg: 'bg-brand/10 text-brand' },
} as const;

const StatCard = ({
  title, value, subtitle, icon: Icon, color, trend
}: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; color: keyof typeof STAT_COLOR_VARIANTS; trend?: string;
}) => {
  const variant = STAT_COLOR_VARIANTS[color];
  return (
    <div className="cd-panel p-6 relative overflow-hidden group hover:shadow-2xl hover:shadow-brand/5 transition-all duration-500">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full blur-2xl transition-colors duration-500 ${variant.glow}`} />
      <div className="flex justify-between items-start relative z-10">
        <div className={`p-3 rounded-2xl ${variant.iconBg}`}>
          <Icon size={24} />
        </div>
        {trend && (
          <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-tighter">
            <ArrowUpRight size={10} /> {trend}
          </span>
        )}
      </div>
      <div className="mt-6 relative z-10">
        <div className="text-3xl font-black text-[#1a2333] tracking-tighter leading-none">{value}</div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{title}</div>
        {subtitle && <div className="text-[10px] font-bold text-slate-500 mt-1">{subtitle}</div>}
      </div>
    </div>
  );
};

const getTonerColorInfo = (type: string) => {
  if (type.includes('black')) {
    return { name: 'Negro', badgeClass: 'bg-slate-950 border-slate-800 text-white', barColor: '#0f172a' };
  }
  if (type.includes('cyan')) {
    return { name: 'Cian', badgeClass: 'bg-cyan-500 border-cyan-400 text-white', barColor: '#06b6d4' };
  }
  if (type.includes('magenta')) {
    return { name: 'Magenta', badgeClass: 'bg-pink-500 border-pink-400 text-white', barColor: '#ec4899' };
  }
  if (type.includes('yellow')) {
    return { name: 'Amarillo', badgeClass: 'bg-yellow-400 border-yellow-300 text-slate-900', barColor: '#eab308' };
  }
  return null;
};


const Dashboard = () => {
  const { data, loading, fetchDashboardData } = useDashboard();
  const now = useNow();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get<Alert[]>('/alerts?resolved=false');
      // Este panel es de CONSUMIBLES — sólo tóner. `type` es texto libre, así que
      // el filtro se hace acá (no hay un `type=` de servidor que exprese "toner_%
      // en cualquiera de sus variantes"). Desde que existen `agent_offline` y
      // `device_offline` (y ya existían códigos EWS libres), sin este filtro
      // aparecerían acá con columnas de tóner vacías — la página dedicada
      // `/alerts` es donde se ven todos los tipos.
      setAlerts(res.filter((a) => a.type.startsWith('toner_')));
    } catch (err) {
      console.error('Error al obtener alertas:', err);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    fetchAlerts();
  }, [fetchDashboardData, fetchAlerts]);

  useEffect(() => {
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-pulse">
        <Activity size={48} className="text-brand animate-spin mb-4" />
        <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Cargando inteligencia de flota...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-[#1a2333] tracking-tighter">Panel de Control</h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">Sincronizado</span>
            </div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Visión estratégica de la infraestructura global</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/clients" className="flex items-center gap-2 px-5 py-3 bg-white text-[#1a2333] font-black text-xs uppercase tracking-widest rounded-2xl border border-slate-200 hover:border-brand transition-all active:scale-95">
            <Plus size={16} /> Nuevo Cliente
          </Link>
          <Link to="/agents" className="flex items-center gap-2 px-5 py-3 bg-[#1a2333] text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-brand-hover transition-all active:scale-95 shadow-xl shadow-brand/10">
            <Cpu size={16} /> Gestionar Agentes
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Parque Global" value={data?.stats?.devices?.toLocaleString() ?? '0'} subtitle="Impresoras Monitoreadas" icon={HardDrive} color="charcoal" trend={data?.stats?.deviceTrend || undefined} />
        <StatCard title="Monitores" value={`${data?.stats?.agents?.online ?? 0}/${data?.stats?.agents?.total ?? 0}`} subtitle="Nodos en línea" icon={Radio} color="emerald" />
        <StatCard title="Clientes" value={data?.stats?.clients?.toLocaleString() ?? '0'} subtitle="Empresas Registradas" icon={Users} color="gray" />
        <StatCard title="Volumen Mensual" value={data?.stats?.volume?.toLocaleString() ?? '0'} subtitle="Páginas Procesadas" icon={BarChart3} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Brand Distribution */}
        <div className="cd-panel p-8 flex flex-col space-y-10">
          <div>
            <h3 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-3">
              <PieChartIcon size={20} className="text-brand" /> Distribución de Marcas
            </h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Composición del parque activo</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center min-h-[250px]">
            {data?.brands.length === 0 ? (
              <div className="text-center py-10 opacity-20"><Activity size={48} className="mx-auto" /></div>
            ) : (
              <div className="w-full flex flex-col md:flex-row items-center gap-8">
                <div className="w-48 h-48 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data?.brands} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="count" nameKey="brand">
                        {data?.brands.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={BRAND_COLORS[index % BRAND_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '12px' }} itemStyle={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3 w-full">
                  {data?.brands.map((b, i) => (
                    <div key={b.brand} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                        <span className="text-[11px] font-black text-[#1a2333] uppercase group-hover:text-brand-hover transition-colors cursor-default">{b.brand}</span>
                      </div>
                      <span className="text-[11px] font-black text-slate-400">{b.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Clients */}
        <div className="cd-panel p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-3">
                <Building2 size={20} className="text-brand-gray" /> Top Cuentas
              </h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Mayores flotas administradas</p>
            </div>
            <Link to="/clients" className="p-2 hover:bg-slate-50 rounded-xl transition-all">
              <ChevronRight size={18} className="text-slate-400" />
            </Link>
          </div>
          <div className="space-y-4">
            {data?.topClients.map((c, i) => (
              <Link to={`/clients/${c.id}`} key={c.id} className="flex items-center gap-4 p-4 rounded-3xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group">
                <div className="w-10 h-10 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-xs font-black text-slate-400 group-hover:border-brand-gray/40 group-hover:text-brand-gray transition-all">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-[#1a2333] truncate uppercase tracking-tight group-hover:text-brand-gray transition-colors">{c.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{c.device_count} Dispositivos</div>
                </div>
                <ArrowUpRight size={16} className="text-slate-200 group-hover:text-brand-gray transition-all" />
              </Link>
            ))}
          </div>
        </div>

        {/* Offline Agents */}
        <div className="cd-panel p-8 border-rose-500/10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-rose-600 tracking-tight flex items-center gap-3">
                <ShieldAlert size={20} /> Nodos Offline
              </h3>
              <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">Atención inmediata requerida</p>
            </div>
            {(data?.offlineAgents.length ?? 0) > 0 && (
              <span className="px-3 py-1 bg-rose-500 text-white text-[10px] font-black rounded-full shadow-lg shadow-rose-900/20">
                {data?.offlineAgents.length}
              </span>
            )}
          </div>
          <div className="space-y-4 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
            {data?.offlineAgents.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-emerald-500/50 bg-emerald-50/50 rounded-3xl border border-emerald-100 border-dashed">
                <Activity size={32} className="mb-3 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-widest">Todos los sistemas operativos</p>
              </div>
            ) : (
              data?.offlineAgents.map((a) => (
                <div key={a.id} className="flex flex-col p-4 rounded-3xl bg-rose-50/50 border border-rose-100/50 hover:bg-rose-50 hover:border-rose-200 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-[#1a2333] uppercase tracking-tight truncate flex-1">{a.client_name}</span>
                    <WifiOff size={14} className="text-rose-500" />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{a.name}</span>
                    <span className="text-[9px] font-black text-rose-600/60 uppercase">
                      Visto hace {Math.round((now - new Date(a.last_seen).getTime()) / 60000)}m
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Consumibles en Alerta */}
        <div className="cd-panel p-8 flex flex-col space-y-6 lg:col-span-3 hover:shadow-2xl hover:shadow-brand/5 transition-all duration-500">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-3">
                <AlertTriangle size={20} className="text-amber-500 animate-pulse" /> Consumibles en Alerta
              </h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Suministros bajos y críticos detectados</p>
            </div>
            {alerts.length > 0 && (
              <span className={`px-3 py-1 text-[10px] font-black rounded-full shadow-lg ${
                alerts.some(a => a.severity === 'critical')
                  ? 'bg-rose-500 text-white shadow-rose-900/20 animate-pulse'
                  : 'bg-amber-500 text-white shadow-amber-900/20'
              }`}>
                {alerts.length}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-[250px] max-h-[350px] overflow-y-auto pr-2 space-y-4">
            {alertsLoading ? (
              <div className="h-64 flex flex-col items-center justify-center animate-pulse">
                <Activity size={32} className="text-brand animate-spin mb-3" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Consultando alertas...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-3xl border border-emerald-100 border-dashed">
                <ShieldCheck size={48} className="mb-3 text-emerald-500 animate-bounce duration-1000" />
                <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600">Niveles Óptimos</h4>
                <p className="text-[10px] font-bold text-slate-400 mt-1">Todos los consumibles por encima de los límites configurados</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                      <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">S/N</th>
                      <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Modelo</th>
                      <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Color</th>
                      <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Descripción</th>
                      <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Motivo</th>
                      <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                      <th className="py-2 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Nivel Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {alerts.map((alert) => {
                      const isToner = alert.type.startsWith('toner_');
                      const tonerInfo = isToner ? getTonerColorInfo(alert.type) : null;
                      return (
                        <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-1.5 px-3 text-[10px] text-[#1a2333] font-black uppercase">
                            {alert.client_name || '-'}
                          </td>
                          <td className="py-1.5 px-3 text-[10px] text-slate-500 font-mono">
                            {alert.serial || '-'}
                          </td>
                          <td className="py-1.5 px-3 text-[10px] text-slate-700 font-bold">
                            {alert.device_name || 'Dispositivo'}
                          </td>
                          <td className="py-1.5 px-3 text-[10px]">
                            {isToner && tonerInfo ? (
                               <div className="flex items-center gap-1.5">
                                 <div className="w-2.5 h-2.5 rounded-sm border border-slate-200" style={{ backgroundColor: tonerInfo.barColor }} />
                                 <span className="font-bold text-slate-600">{tonerInfo.name}</span>
                               </div>
                            ) : (
                               <span className="text-slate-400 font-medium">Sin color</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-[10px] text-slate-600 max-w-[200px] truncate" title={alert.message}>
                            {alert.message.split(' en ')[0]}
                          </td>
                          <td className="py-1.5 px-3">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              alert.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {alert.severity === 'critical' ? 'Crítico' : 'Nivel bajo'}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-[10px] text-slate-500 font-medium">
                            {new Date(alert.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-1.5 px-3 w-32">
                            {isToner ? (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200/50">
                                  <div className="h-full rounded-full" style={{ width: `${alert.value}%`, backgroundColor: tonerInfo?.barColor || '#ef4444' }} />
                                </div>
                                <span className="text-[9px] font-bold text-slate-500 w-6 text-right">{alert.value}%</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        <Link to="/reports" className="flex items-center gap-4 p-6 bg-white border border-slate-200 rounded-[2.5rem] hover:border-brand hover:shadow-2xl hover:shadow-brand/5 transition-all group">
          <div className="p-4 bg-brand/10 text-brand rounded-3xl group-hover:scale-110 transition-transform">
            <FileText size={24} />
          </div>
          <div>
            <h4 className="text-sm font-black text-[#1a2333] uppercase tracking-tight">Reportes de Facturación</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Auditoría de consumos</p>
          </div>
        </Link>
        <Link to="/settings" className="flex items-center gap-4 p-6 bg-white border border-slate-200 rounded-[2.5rem] hover:border-slate-900 hover:shadow-2xl hover:shadow-slate-900/5 transition-all group">
          <div className="p-4 bg-slate-50 text-slate-600 rounded-3xl group-hover:scale-110 transition-transform">
            <Settings size={24} />
          </div>
          <div>
            <h4 className="text-sm font-black text-[#1a2333] uppercase tracking-tight">Preferencias Globales</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ajustes del ecosistema</p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;
