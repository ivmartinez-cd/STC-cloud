import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ArrowLeft, Printer, RefreshCw, FileText } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

interface Reading {
  id: string;
  time:        string;
  total_pages: number;
  mono_pages:  number | null;
  color_pages: number | null;
  status:      string;
}

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const load = () => {
    setLoading(true);
    api.get<Reading[]>(`/devices/${id}/readings?limit=48`)
      .then(setReadings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const latest = readings[0] ?? null;
  const chartData = [...readings].reverse().map(r => ({
    time:  new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    Total: r.total_pages,
    Mono:  r.mono_pages  ?? 0,
    Color: r.color_pages ?? 0,
  }));

  const isOk = latest && ['idle', 'online'].includes(latest.status);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white border border-transparent hover:border-[#d1d8e0] rounded-lg transition-all text-slate-400 hover:text-[#2980b9]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#1a2333]">Detalle de Dispositivo</h1>
            <p className="text-slate-400 text-sm mt-0.5">Historial de contadores de páginas</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-[#2980b9] hover:bg-white border border-transparent hover:border-[#d1d8e0] rounded-lg transition-all disabled:opacity-40"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">{error}</div>
      )}

      {!error && readings.length === 0 && !loading && (
        <div className="cd-panel rounded-xl text-center py-16">
          <Printer size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-400 text-sm">No hay lecturas disponibles para este dispositivo.</p>
        </div>
      )}

      {!error && latest && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart */}
          <div className="lg:col-span-2 cd-panel rounded-xl p-6">
            <h3 className="font-semibold text-[#1a2333] text-sm mb-5">
              Contadores Históricos — últimas {readings.length} lecturas
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={64} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #d1d8e0', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#1a2333' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#64748b' }} />
                <Line type="monotone" dataKey="Total" stroke="#2980b9" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Mono"  stroke="#94a3b8" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="Color" stroke="#f39c12" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Counters panel */}
          <div className="cd-panel rounded-xl p-5 flex flex-col gap-5">
            <div>
              <h3 className="font-semibold text-[#1a2333] text-sm mb-4 flex items-center gap-2">
                <FileText size={15} className="text-[#2980b9]" />
                Contadores Actuales
              </h3>

              <div className="space-y-3">
                <div className="bg-[#e9eff3] rounded-lg p-4">
                  <div className="text-xs text-slate-500 mb-1">Total de Páginas</div>
                  <div className="text-2xl font-bold text-[#1a2333]">{latest.total_pages.toLocaleString()}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#e9eff3] rounded-lg p-4">
                    <div className="text-xs text-slate-500 mb-1">Monocromo</div>
                    <div className="text-xl font-bold text-[#1a2333]">{(latest.mono_pages ?? 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-[#f39c12]/10 border border-[#f39c12]/20 rounded-lg p-4">
                    <div className="text-xs text-[#f39c12] mb-1">Color</div>
                    <div className="text-xl font-bold text-[#e67e22]">{(latest.color_pages ?? 0).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-[#d1d8e0] pt-4 text-sm space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Estado</span>
                <span className={`font-semibold capitalize text-sm ${isOk ? 'text-[#689f38]' : 'text-slate-400'}`}>
                  {latest.status || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Última lectura</span>
                <span className="text-xs text-slate-400">{new Date(latest.time).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceDetail;
