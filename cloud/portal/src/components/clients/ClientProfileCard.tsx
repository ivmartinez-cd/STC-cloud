import { Users, Mail, Phone, MapPin } from 'lucide-react';
import type { Client } from '../../types/monitor';

export default function ClientProfileCard({ client }: { client: Client }) {
  return (
    <div className="cd-panel p-8 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-5 mb-8">
          <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center shadow-sm">
            <Users size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#1a2333] tracking-tight">{client.name}</h1>
            <span className="text-[10px] font-extrabold text-brand uppercase tracking-[0.2em]">Perfil Corporativo</span>
          </div>
        </div>
        <div className="space-y-4">
          {client.contact_name && (
            <div className="flex items-center gap-4 group">
              <div className="p-2 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                <Users size={16} />
              </div>
              <span className="font-bold text-sm text-[#1a2333]">{client.contact_name}</span>
            </div>
          )}
          {client.contact_email && (
            <div className="flex items-center gap-4 group">
              <div className="p-2 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                <Mail size={16} />
              </div>
              <span className="text-sm text-slate-600 truncate font-medium">{client.contact_email}</span>
            </div>
          )}
          {client.contact_phone && (
            <div className="flex items-center gap-4 group">
              <div className="p-2 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                <Phone size={16} />
              </div>
              <span className="text-sm text-slate-600 font-medium">{client.contact_phone}</span>
            </div>
          )}
          {(client.address || client.country) && (
            <div className="flex items-center gap-4 group">
              <div className="p-2 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                <MapPin size={16} />
              </div>
              <span className="text-xs text-slate-500 font-medium leading-tight">
                {[client.address, client.country].filter(Boolean).join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
