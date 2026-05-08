import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Users, Search, Building2, Radio, HardDrive, ChevronRight, Plus, X, Loader2 } from 'lucide-react';

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
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#689f38] bg-[#689f38]/10 px-2.5 py-1 rounded">
        <span className="w-1.5 h-1.5 rounded-full bg-[#689f38]" />
        Activo
      </span>
    );
  }
  if (monitors > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Sin dispositivos
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Inactivo
    </span>
  );
}

const Clients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  
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
      .catch((e: Error) => setError(e.message))
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
      setShowModal(false);
      setFormData({ name: '', contact_name: '', contact_phone: '', contact_email: '' });
      fetchClients();
    } catch (err: any) {
      alert('Error al crear cliente: ' + err.message);
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
    <div className="space-y-5 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2333]">Clientes</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {clients.length} empresa(s) registrada(s)
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#f39c12] hover:bg-[#e67e22] text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold shadow-md transition-all active:scale-95"
        >
          <Plus size={18} />
          Nuevo Cliente
        </button>
      </header>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
        <input
          type="text"
          placeholder="Filtrar por nombre, contacto, país..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="cd-input w-full !pl-10 py-2"
        />
      </div>

      {/* Table */}
      <div className="cd-panel rounded-xl overflow-hidden">
        {loading && (
          <div className="text-center py-14 text-slate-400 text-sm">Cargando clientes...</div>
        )}
        {error && (
          <div className="text-center py-14 text-red-500 text-sm">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-14">
            <Building2 size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-400 text-sm">
              {search ? 'Sin resultados para la búsqueda.' : 'No hay clientes registrados aún.'}
            </p>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <table className="w-full text-sm cd-table">
            <thead>
              <tr className="bg-[#2980b9] text-white text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left font-semibold">Cliente</th>
                <th className="px-5 py-3 text-left font-semibold">Estado</th>
                <th className="px-5 py-3 text-left font-semibold hidden md:table-cell">Contacto</th>
                <th className="px-5 py-3 text-center font-semibold">
                  <span className="inline-flex items-center gap-1 justify-center"><Radio size={11} /> Monitores</span>
                </th>
                <th className="px-5 py-3 text-center font-semibold">
                  <span className="inline-flex items-center gap-1 justify-center"><HardDrive size={11} /> Dispositivos</span>
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => (
                <tr key={client.id} className="border-t border-[#d1d8e0] transition-colors group">
                  <td className="px-5 py-3">
                    <Link to={`/clients/${client.id}`} className="flex items-center gap-3">
                      <div className="w-7 h-7 bg-[#2980b9]/10 rounded-lg flex items-center justify-center shrink-0">
                        <Users size={13} className="text-[#2980b9]" />
                      </div>
                      <div>
                        <div className="font-semibold text-[#1a2333] group-hover:text-[#2980b9] transition-colors text-sm">
                          {client.name}
                        </div>
                        {client.country && (
                          <div className="text-xs text-slate-400">{client.country}</div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge monitors={client.monitor_count} devices={client.device_count} />
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <div className="text-sm text-[#1a2333] truncate max-w-[180px]">
                      {client.contact_name || client.contact_email || (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>
                    {client.contact_name && client.contact_email && (
                      <div className="text-xs text-slate-400 truncate max-w-[180px]">{client.contact_email}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-sm font-semibold text-[#2980b9]">
                      {client.monitor_count}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-sm font-semibold text-[#2980b9]">
                      {client.device_count}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/clients/${client.id}`}>
                      <ChevronRight size={15} className="text-slate-300 group-hover:text-[#2980b9] transition-colors" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Client Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-[#2980b9] text-white">
              <h2 className="font-bold">Nuevo Cliente</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
              </button>
            </header>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre de la Empresa *</label>
                <input
                  required
                  type="text"
                  className="cd-input w-full"
                  placeholder="Ej: Canal Directo S.A."
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre y Apellido del Contacto</label>
                <input
                  type="text"
                  className="cd-input w-full"
                  placeholder="Juan Pérez"
                  value={formData.contact_name}
                  onChange={e => setFormData({ ...formData, contact_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Teléfono</label>
                  <input
                    type="tel"
                    className="cd-input w-full"
                    placeholder="+54 11 1234-5678"
                    value={formData.contact_phone}
                    onChange={e => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    className="cd-input w-full"
                    placeholder="email@empresa.com"
                    value={formData.contact_email}
                    onChange={e => setFormData({ ...formData, contact_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-[#f39c12] text-white font-bold hover:bg-[#e67e22] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Crear Cliente'}
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
