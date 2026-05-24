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


const BRAND_COLORS = ['#2980b9', '#3498db', '#1abc9c', '#f1c40f', '#f7931d', '#e74c3c'];

const StatCard = ({
  title, value, subtitle, icon: Icon, color, trend
}: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; color: string; trend?: string;
}) => (
  <div className="cd-panel p-6 relative overflow-hidden group hover:shadow-2xl hover:shadow-blue-900/5 transition-all duration-500">
    <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-${color}-500/5 rounded-full blur-2xl group-hover:bg-${color}-500/10 transition-colors duration-500`} />
    <div className="flex justify-between items-start relative z-10">
      <div className={`p-3 rounded-2xl bg-${color}-50 text-${color}-600`}>
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

interface Alert {
  id: string;
  device_id: string;
  type: string;
  severity: 'critical' | 'warning';
  message: string;
  value: number;
  resolved: boolean;
  created_at: string;
  brand: string;
  ip_address: string;
  device_name: string;
  serial: string | null;
  agent_name: string | null;
  client_name: string | null;
}

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
      setAlerts(res);
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
        <Activity size={48} className="text-blue-500 animate-spin mb-4" />
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
          <Link to="/clients" className="flex items-center gap-2 px-5 py-3 bg-white text-[#1a2333] font-black text-xs uppercase tracking-widest rounded-2xl border border-slate-200 hover:border-blue-500 transition-all active:scale-95">
            <Plus size={16} /> Nuevo Cliente
          </Link>
          <Link to="/agents" className="flex items-center gap-2 px-5 py-3 bg-[#1a2333] text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-blue-600 transition-all active:scale-95 shadow-xl shadow-blue-900/10">
            <Cpu size={16} /> Gestionar Agentes
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Parque Global" value={data?.stats?.devices?.toLocaleString() ?? '0'} subtitle="Impresoras Monitoreadas" icon={HardDrive} color="blue" trend={data?.stats?.deviceTrend || undefined} />
        <StatCard title="Monitores" value={`${data?.stats?.agents?.online ?? 0}/${data?.stats?.agents?.total ?? 0}`} subtitle="Nodos en línea" icon={Radio} color="emerald" />
        <StatCard title="Clientes" value={data?.stats?.clients?.toLocaleString() ?? '0'} subtitle="Empresas Registradas" icon={Users} color="indigo" />
        <StatCard title="Volumen Mensual" value={data?.stats?.volume?.toLocaleString() ?? '0'} subtitle="Páginas Procesadas" icon={BarChart3} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Brand Distribution */}
        <div className="cd-panel p-8 flex flex-col space-y-10">
          <div>
            <h3 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-3">
              <PieChartIcon size={20} className="text-blue-500" /> Distribución de Marcas
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
                        <span className="text-[11px] font-black text-[#1a2333] uppercase group-hover:text-blue-600 transition-colors cursor-default">{b.brand}</span>
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
                <Building2 size={20} className="text-indigo-500" /> Top Cuentas
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
                <div className="w-10 h-10 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-xs font-black text-slate-400 group-hover:border-indigo-200 group-hover:text-indigo-500 transition-all">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-[#1a2333] truncate uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{c.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{c.device_count} Dispositivos</div>
                </div>
                <ArrowUpRight size={16} className="text-slate-200 group-hover:text-indigo-500 transition-all" />
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
          <div className="space-y-4">
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
        <div className="cd-panel p-8 flex flex-col space-y-6 lg:col-span-3 hover:shadow-2xl hover:shadow-blue-900/5 transition-all duration-500">
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
                <Activity size={32} className="text-blue-500 animate-spin mb-3" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Consultando alertas...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-3xl border border-emerald-100 border-dashed">
                <ShieldCheck size={48} className="mb-3 text-emerald-500 animate-bounce duration-1000" />
                <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600">Niveles Óptimos</h4>
                <p className="text-[10px] font-bold text-slate-400 mt-1">Todos los consumibles por encima de los límites configurados</p>
              </div>
            ) : (
              alerts.map((alert) => {
                const isToner = alert.type.startsWith('toner_');
                const tonerInfo = isToner ? getTonerColorInfo(alert.type) : null;
                return (
                  <div
                    key={alert.id}
                    className={`p-5 rounded-3xl border transition-all ${
                      alert.severity === 'critical'
                        ? 'bg-rose-50/30 border-rose-100/60 hover:bg-rose-50 hover:border-rose-200'
                        : 'bg-amber-50/30 border-amber-100/60 hover:bg-amber-50 hover:border-amber-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-[#1a2333] uppercase tracking-tight truncate">
                            {alert.device_name || 'Dispositivo'}
                          </span>
                          <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-md">
                            {alert.ip_address}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {alert.client_name && (
                            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                              {alert.client_name}
                            </span>
                          )}
                          {alert.agent_name && (
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest bg-white/80 px-2 py-0.5 rounded-md border border-slate-200/60">
                              {alert.agent_name}
                            </span>
                          )}
                          {alert.serial && (
                            <span className="text-[9px] font-mono text-slate-500 tracking-wide" title={alert.serial}>
                              S/N: {alert.serial}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-slate-500 mt-1 leading-relaxed">
                          {alert.message}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isToner && tonerInfo && (
                          <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border ${tonerInfo.badgeClass}`}>
                            {tonerInfo.name}
                          </span>
                        )}
                        <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${
                          alert.severity === 'critical'
                            ? 'bg-rose-500 text-white border-rose-600 shadow-md shadow-rose-900/10'
                            : 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-900/10'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          {alert.severity === 'critical' ? 'Crítico' : 'Bajo'}
                        </span>
                      </div>
                    </div>

                    {isToner && (
                      <div className="mt-4">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                          <span>Nivel de Tóner</span>
                          <span>{alert.value}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/30">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${alert.value}%`,
                              backgroundColor: tonerInfo?.barColor || '#ef4444',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        <Link to="/reports" className="flex items-center gap-4 p-6 bg-white border border-slate-200 rounded-[2.5rem] hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-900/5 transition-all group">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-3xl group-hover:scale-110 transition-transform">
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
