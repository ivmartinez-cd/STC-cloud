import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Users, Search, Building2, Radio, HardDrive, ChevronRight, Plus, X, Loader2, MapPin, Mail } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  address: string | null;
  country: string | null;
  created_at: string;
  monitor_count: number;
  device_count: number;
}

function StatusBadge({ monitors, devices }: { monitors: number; devices: number }) {
  if (devices > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Activo
      </span>
    );
  }
  if (monitors > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Sin dispositivos
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
      Inactivo
    </span>
  );
}

const Clients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const { showToast } = useToast();
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
  });

  const fetchClients = () => {
    setLoading(true);
    api.get<Client[]>('/clients')
      .then(setClients)
      .catch((e: Error) => {
        setError(e.message);
        showToast('Error al cargar la lista de clientes', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/clients', formData);
      showToast('Cliente creado exitosamente', 'success');
      setShowModal(false);
      setFormData({ name: '', contact_name: '', contact_phone: '', contact_email: '' });
      fetchClients();
    } catch (err: any) {
      showToast('Error al crear cliente: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = clients.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.contact_name?.toLowerCase().includes(q) ||
      c.contact_email?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q) ||
      c.country?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Clientes</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            {clients.length} empresa(s) en la red de monitoreo
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#e67e22] hover:bg-[#d35400] text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-orange-900/20 transition-all active:scale-95 whitespace-nowrap"
        >
          <Plus size={18} />
          Nuevo Cliente
        </button>
      </header>

      {/* Search & Stats Header */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Filtrar por nombre, contacto, país..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="cd-input w-full !pl-12 !h-12 !bg-white shadow-sm border-slate-200 focus:border-[#2980b9]"
          />
        </div>
        <div className="cd-panel bg-[#2980b9] border-none p-3 flex items-center justify-center gap-3 text-white">
          <Users size={18} className="opacity-80" />
          <span className="text-sm font-bold uppercase tracking-wider">{filtered.length} Filtrados</span>
        </div>
      </div>

      {/* Table Section */}
      <div className="cd-panel border-slate-200">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Loader2 size={32} className="animate-spin text-[#2980b9]" />
            <span className="text-sm font-bold uppercase tracking-widest opacity-50">Sincronizando...</span>
          </div>
        )}
        {error && !loading && (
          <div className="text-center py-20">
            <AlertTriangle size={40} className="mx-auto mb-3 text-rose-300" />
            <p className="text-rose-500 font-bold">{error}</p>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <Building2 size={48} className="mx-auto mb-4 text-slate-200" />
            <p className="text-slate-400 font-medium">
              {search ? 'No se encontraron clientes para esta búsqueda.' : 'Aún no hay clientes registrados.'}
            </p>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm cd-table border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-[0.15em]">
                  <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Información del Cliente</th>
                  <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Estado Operativo</th>
                  <th className="px-6 py-4 text-left font-bold border-b border-slate-100 hidden md:table-cell">Contacto Directo</th>
                  <th className="px-6 py-4 text-center font-bold border-b border-slate-100">Monitores</th>
                  <th className="px-6 py-4 text-center font-bold border-b border-slate-100">Equipos</th>
                  <th className="px-6 py-4 border-b border-slate-100" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(client => (
                  <tr key={client.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <Link to={`/clients/${client.id}`} className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[#2980b9] group-hover:text-white transition-all">
                          <Building2 size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[#1a2333] group-hover:text-[#2980b9] transition-colors truncate">
                            {client.name}
                          </div>
                          {client.country && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                              <MapPin size={10} />
                              {client.country}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge monitors={client.monitor_count} devices={client.device_count} />
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <div className="flex flex-col gap-1">
                        <div className="text-xs font-bold text-slate-700 truncate max-w-[200px]">
                          {client.contact_name || <span className="text-slate-300 italic font-medium">Sin asignar</span>}
                        </div>
                        {client.contact_email && (
                          <div className="flex items-center gap-1.5 text-[10px] text-[#2980b9] font-bold truncate max-w-[200px]">
                            <Mail size={10} />
                            {client.contact_email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-extrabold text-[#2980b9] min-w-[32px]">
                        {client.monitor_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-extrabold text-[#2980b9] min-w-[32px]">
                        {client.device_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        to={`/clients/${client.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-300 group-hover:text-[#2980b9] group-hover:bg-white transition-all shadow-sm"
                      >
                        <ChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-[#2980b9] to-[#2c3e50] text-white">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">Nuevo Cliente</h2>
                <p className="text-blue-100/70 text-xs font-bold uppercase tracking-wider mt-1">Registro de empresa</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <X size={24} />
              </button>
            </header>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Nombre de la Empresa *</label>
                <input
                  required
                  type="text"
                  className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9]"
                  placeholder="Ej: Canal Directo S.A."
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Contacto Principal</label>
                <input
                  type="text"
                  className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9]"
                  placeholder="Nombre y Apellido"
                  value={formData.contact_name}
                  onChange={e => setFormData({ ...formData, contact_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                  <input
                    type="tel"
                    className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9]"
                    placeholder="+54 11 ..."
                    value={formData.contact_phone}
                    onChange={e => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Email Corporativo</label>
                  <input
                    type="email"
                    className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9]"
                    placeholder="email@empresa.com"
                    value={formData.contact_email}
                    onChange={e => setFormData({ ...formData, contact_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 rounded-xl bg-[#e67e22] text-white font-extrabold hover:bg-[#d35400] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm shadow-lg shadow-orange-900/20"
                >
                  {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : 'Registrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;

