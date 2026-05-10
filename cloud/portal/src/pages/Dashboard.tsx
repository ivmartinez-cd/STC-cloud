import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  HardDrive, Activity, Radio, Users, ChevronRight, 
  WifiOff, BarChart3, PieChart as PieChartIcon, 
  Plus, FileText, Settings, ShieldAlert, Cpu, 
  ArrowUpRight, Building2
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import {
  Tooltip,
  ResponsiveContainer, Cell,
  PieChart, Pie
} from 'recharts';

interface DashboardData {
  stats: {
    devices: number;
    agents: {
      total: number;
      online: number;
    };
    clients: number;
    volume: number;
  };
  topClients: Array<{
    id: string;
    name: string;
    device_count: number;
  }>;
  brands: Array<{
    brand: string;
    count: number;
  }>;
  offlineAgents: Array<{
    id: string;
    name: string;
    client_name: string;
    last_seen: string;
  }>;
  systemHealth: {
    status: 'healthy' | 'degraded' | 'error';
    uptime: number;
    lastSync: string | null;
  };
}

const StatCard = ({
  title, value, subtitle, icon: Icon, color, trend
}: {
  title: string; value: string | number; subtitle?: string; icon: React.ElementType; color: string; trend?: string;
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

const BRAND_COLORS = ['#2980b9', '#3498db', '#1abc9c', '#f1c40f', '#e67e22', '#e74c3c'];

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await api.get<DashboardData>('/dashboard');
      setData(res);
    } catch {
      showToast('Error al actualizar panel global', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

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

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Parque Global" 
          value={data?.stats?.devices?.toLocaleString() ?? '0'} 
          subtitle="Impresoras Monitoreadas"
          icon={HardDrive} 
          color="blue" 
          trend="+12% este mes"
        />
        <StatCard 
          title="Monitores" 
          value={`${data?.stats?.agents?.online ?? 0}/${data?.stats?.agents?.total ?? 0}`} 
          subtitle="Nodos en línea"
          icon={Radio} 
          color="emerald" 
        />
        <StatCard 
          title="Clientes" 
          value={data?.stats?.clients?.toLocaleString() ?? '0'} 
          subtitle="Empresas Registradas"
          icon={Users} 
          color="indigo" 
        />
        <StatCard 
          title="Volumen Mensual" 
          value={data?.stats?.volume?.toLocaleString() ?? '0'} 
          subtitle="Páginas Procesadas"
          icon={BarChart3} 
          color="orange" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Infrastructure Health & Distribution */}
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
                      <Pie
                        data={data?.brands}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="brand"
                      >
                        {data?.brands.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={BRAND_COLORS[index % BRAND_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '12px' }}
                        itemStyle={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}
                      />
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

        {/* Top Clients by Fleet Size */}
        <div className="cd-panel p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-3">
                <Building2 size={20} className="text-indigo-500" /> Top Cuentas
              </h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Mayores flotas administradas</p>
            </div>
            <Link to="/clients" className="p-2 hover:bg-slate-50 rounded-xl transition-all">
              <ChevronRight size={18} className="text-slate-300" />
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

        {/* Critical Alerts - Offline Agents */}
        <div className="cd-panel p-8 border-rose-500/10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-rose-600 tracking-tight flex items-center gap-3">
                <ShieldAlert size={20} /> Nodos Offline
              </h3>
              <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">Atención inmediata requerida</p>
            </div>
            {data?.offlineAgents.length !== 0 && (
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
                <div key={a.id} className="flex flex-col p-4 rounded-3xl bg-rose-50/50 border border-rose-100/50 hover:bg-rose-50 hover:border-rose-200 transition-all group">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-[#1a2333] uppercase tracking-tight truncate flex-1">{a.client_name}</span>
                    <WifiOff size={14} className="text-rose-500" />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{a.name}</span>
                    <span className="text-[9px] font-black text-rose-600/60 uppercase">Visto hace {Math.round((Date.now() - new Date(a.last_seen).getTime()) / 60000)}m</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Access Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
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
        <div className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] shadow-xl shadow-blue-900/20 text-white relative overflow-hidden group flex items-center justify-between">
          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${data?.systemHealth.status === 'healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'} `} />
              <h4 className="text-sm font-black uppercase tracking-tight">Estado del Sistema</h4>
            </div>
            <div className="flex flex-col mt-1">
              <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest">
                Uptime: {data?.systemHealth.uptime ? Math.floor(data.systemHealth.uptime / 3600) : 0}h {data?.systemHealth.uptime ? Math.floor((data.systemHealth.uptime % 3600) / 60) : 0}m
              </p>
              <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest mt-0.5">
                Sinc: {data?.systemHealth.lastSync ? new Date(data.systemHealth.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Sin datos'}
              </p>
            </div>
          </div>
          <ShieldAlert size={32} className={`relative z-10 transition-all duration-500 ${data?.systemHealth.status === 'healthy' ? 'text-emerald-300 opacity-20' : 'text-rose-300 opacity-100'}`} />
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/20 transition-colors duration-700" />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

