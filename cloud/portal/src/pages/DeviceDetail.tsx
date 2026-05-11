import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ArrowLeft, Printer, RefreshCw, FileText, Clock, TrendingUp, Activity } from 'lucide-react';
import {
  Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Area, AreaChart
} from 'recharts';

interface Reading {
  id: string;
  time:        string;
  total_pages: number;
  mono_pages:  number | null;
  color_pages: number | null;
  totalPages?: number; // Compatibilidad con camelCase
  monoPages?:  number;
  colorPages?: number;
  status:      string;
}

interface Device {
  id:           string;
  brand:        string;
  model:        string;
  serial:       string;
  ip:           string;
  monitor_name: string;
  client_name:  string;
}

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [device, setDevice]     = useState<Device | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const load = useCallback(() => {
    setLoading(true);
    
    // Cargar datos del dispositivo y lecturas en paralelo
    Promise.all([
      api.get<Device>(`/devices/${id}`),
      api.get<Reading[]>(`/devices/${id}/readings?limit=48`)
    ])
    .then(([deviceData, readingsData]) => {
      setDevice(deviceData);
      setReadings(Array.isArray(readingsData) ? readingsData : []);
    })
    .catch((e: Error) => setError(e.message))
    .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const latest = readings[0] ?? null;
  
  // Normalizar datos (manejar tanto snake_case como camelCase)
  const chartData = [...readings].reverse().map(r => ({
    time:  new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    Total: r.total_pages ?? r.totalPages ?? 0,
    Mono:  r.mono_pages  ?? r.monoPages  ?? 0,
    Color: r.color_pages ?? r.colorPages ?? 0,
  }));

  const isOk = latest && ['idle', 'online', 'ok', 'running'].includes(latest.status.toLowerCase());

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-3 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl transition-all text-slate-400 hover:text-[#2980b9] shadow-sm active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Printer size={16} className="text-[#2980b9]" />
              <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Detalle del Dispositivo</h1>
            </div>
            <p className="text-slate-400 text-sm mt-1 font-medium">Análisis de rendimiento y contadores históricos</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-3 bg-white text-slate-400 hover:text-[#2980b9] border border-slate-100 rounded-2xl transition-all shadow-sm active:scale-95 disabled:opacity-40"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-[24px] p-6 text-rose-600 font-bold animate-in shake">
          Error: {error}
        </div>
      )}

      {!error && readings.length === 0 && !loading && (
        <div className="cd-panel text-center py-24">
          <Printer size={64} className="mx-auto mb-6 text-slate-100" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Sin lecturas registradas</p>
        </div>
      )}

      {/* Device Info Bar */}
      {device && (
        <div className="cd-panel p-6 bg-white border-slate-100 flex flex-wrap gap-8 items-center animate-in slide-in-from-top duration-700">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-slate-50 rounded-xl text-[#2980b9]"><Printer size={20}/></div>
             <div>
               <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Modelo / Marca</p>
               <p className="text-sm font-black text-slate-700 tracking-tight">{device.model} ({device.brand})</p>
             </div>
          </div>
          <div className="w-px h-8 bg-slate-100 hidden md:block"></div>
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Número de Serie</p>
            <p className="text-sm font-black text-slate-700 tracking-tight">{device.serial || 'S/N Desconocido'}</p>
          </div>
          <div className="w-px h-8 bg-slate-100 hidden md:block"></div>
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Dirección IP</p>
            <p className="text-sm font-black text-[#2980b9] tracking-tight">{device.ip}</p>
          </div>
          <div className="md:ml-auto flex items-center gap-3">
             <div className="text-right hidden sm:block">
               <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Cliente / Monitor</p>
               <p className="text-xs font-bold text-slate-500">{device.client_name} · {device.monitor_name}</p>
             </div>
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
        </div>
      )}

      {!error && latest && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chart Section */}
          <div className="lg:col-span-2 space-y-8">
            <div className="cd-panel p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-extrabold text-[#1a2333] text-lg flex items-center gap-3">
                  <TrendingUp size={20} className="text-[#2980b9]" />
                  Tendencia de Impresión
                </h3>
                <div className="flex gap-2">
                   <span className="text-[10px] font-extrabold px-3 py-1 bg-slate-100 text-slate-500 rounded-full uppercase tracking-widest">
                     Últimas {readings.length} lecturas
                   </span>
                </div>
              </div>
              
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2980b9" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#2980b9" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
                      axisLine={false} 
                      tickLine={false}
                      dy={10}
                    />
                    <YAxis 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
                      width={40} 
                      axisLine={false} 
                      tickLine={false} 
                    />
                    <Tooltip
                      contentStyle={{ 
                        background: '#fff', 
                        border: 'none', 
                        borderRadius: '16px', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        fontSize: '12px',
                        fontWeight: '800'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="Total" 
                      stroke="#2980b9" 
                      strokeWidth={4} 
                      fillOpacity={1} 
                      fill="url(#colorTotal)" 
                      animationDuration={1500}
                    />
                    <Line type="monotone" dataKey="Mono" stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="cd-panel p-6 border-l-4 border-l-[#2980b9]">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 text-[#2980b9] rounded-2xl">
                    <Activity size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Estado Operativo</p>
                    <p className={`text-lg font-extrabold capitalize ${isOk ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {latest.status || 'Desconocido'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="cd-panel p-6 border-l-4 border-l-emerald-500">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                    <Clock size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Última Sincronización</p>
                    <p className="text-lg font-extrabold text-slate-700">
                      {new Date(latest.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} hs
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Panel */}
          <div className="space-y-6">
            <div className="cd-panel p-8 bg-gradient-to-br from-[#1a2333] to-[#2c3e50] text-white border-none shadow-2xl shadow-blue-900/20">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                  <FileText size={20} className="text-blue-300" />
                </div>
                <h3 className="font-extrabold text-lg tracking-tight">Contadores Actuales</h3>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-extrabold text-blue-300/60 uppercase tracking-widest ml-1">Total Acumulado</p>
                  <div className="text-5xl font-black tracking-tighter text-white">
                    {(latest.total_pages ?? latest.totalPages ?? 0).toLocaleString()}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-4">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-5 backdrop-blur-sm">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Monocromo</p>
                    <p className="text-2xl font-black">{(latest.mono_pages ?? latest.monoPages ?? 0).toLocaleString()}</p>
                  </div>
                  
                  <div className="bg-gradient-to-r from-[#e67e22]/20 to-transparent border border-[#e67e22]/30 rounded-3xl p-5 backdrop-blur-sm">
                    <p className="text-[10px] font-extrabold text-[#f39c12] uppercase tracking-widest mb-1">Color</p>
                    <p className="text-2xl font-black text-[#f39c12]">{(latest.color_pages ?? latest.colorPages ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-white/10 flex flex-col gap-4">
                <div className="flex justify-between items-center px-2">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Lectura realizada el</span>
                  <span className="text-xs font-bold text-slate-300">{new Date(latest.time).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="cd-panel p-6 bg-slate-50 border-slate-100">
               <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-4">Registro de Sistema</p>
               <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
                    <p className="text-xs font-bold text-slate-600">Dispositivo autorizado para red</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50"></div>
                    <p className="text-xs font-bold text-slate-600">Integridad de datos verificada</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceDetail;

