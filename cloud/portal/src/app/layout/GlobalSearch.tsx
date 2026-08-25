import { Link } from 'react-router-dom';
import { Search, Users, Shield } from 'lucide-react';
import type { GlobalSearchState, SearchClient, SearchDevice } from './useGlobalSearch';

const ITEM = 'flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors group';
const SECTION_TITLE = 'px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest';

const ClientResults = ({ clients, onPick }: { clients: SearchClient[]; onPick: () => void }) => (
  <div className="p-2">
    <div className={SECTION_TITLE}>Clientes</div>
    {clients.map((client) => (
      <Link key={client.id} to={`/clients/${client.id}`} onClick={onPick} className={ITEM}>
        <div className="w-8 h-8 rounded-lg bg-brand-gray/10 flex items-center justify-center text-brand-gray group-hover:bg-brand-gray group-hover:text-white transition-colors">
          <Users size={14} />
        </div>
        <span className="text-sm font-semibold text-slate-700">{client.name}</span>
      </Link>
    ))}
  </div>
);

const DeviceResults = ({ devices, onPick }: { devices: SearchDevice[]; onPick: () => void }) => (
  <div className="p-2 border-t border-slate-100">
    <div className={SECTION_TITLE}>Dispositivos</div>
    {devices.map((device) => (
      <Link key={device.id} to={`/devices/${device.id}`} onClick={onPick} className={ITEM}>
        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
          <Shield size={14} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-slate-700">{device.serial_number}</span>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{device.brand} {device.model}</span>
        </div>
      </Link>
    ))}
  </div>
);

const ResultsDropdown = ({ s }: { s: GlobalSearchState }) => {
  const { clients, devices } = s.results;
  const empty = clients.length === 0 && devices.length === 0;
  if (!s.showResults || (empty && !s.isSearching)) return null;
  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
      {s.isSearching && (
        <div className="p-4 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-brand rounded-full animate-spin" />
        </div>
      )}
      {!s.isSearching && clients.length > 0 && <ClientResults clients={clients} onPick={s.reset} />}
      {!s.isSearching && devices.length > 0 && <DeviceResults devices={devices} onPick={s.reset} />}
      {!s.isSearching && s.query.length >= 2 && empty && (
        <div className="p-6 text-center text-slate-400 text-sm italic">No se encontraron resultados para "{s.query}"</div>
      )}
    </div>
  );
};

/** Buscador global de la cabecera (Ctrl K). Oculto en pantallas chicas. */
const GlobalSearch = ({ s }: { s: GlobalSearchState }) => (
  <div className="relative hidden sm:flex items-center group" ref={s.containerRef}>
    <div className="absolute left-3.5 text-slate-400 group-focus-within:text-brand transition-colors pointer-events-none">
      <Search size={16} />
    </div>
    <input id="global-search" type="text" placeholder="Buscar..." value={s.query}
      onChange={(e) => s.setQuery(e.target.value)} onFocus={() => s.setShowResults(true)}
      className="cd-input w-64 !pl-11 !pr-10 !bg-slate-100/50 border-transparent focus:!bg-white focus:!border-brand/30 h-10 text-sm transition-all rounded-xl" />
    <div className="absolute right-3 px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-400 pointer-events-none">Ctrl K</div>
    <ResultsDropdown s={s} />
  </div>
);

export default GlobalSearch;
