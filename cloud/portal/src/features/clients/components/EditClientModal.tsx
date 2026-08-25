import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';
import type { Client } from '../../../shared/types/monitor';

interface Fields { name: string; contact_name: string; contact_phone: string; contact_email: string; address: string; country: string; }

function fieldsOf(client: Client): Fields {
  return {
    name: client.name, contact_name: client.contact_name ?? '', contact_phone: client.contact_phone ?? '',
    contact_email: client.contact_email ?? '', address: client.address ?? '', country: client.country ?? '',
  };
}

const LABEL = 'text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1';
const INPUT = 'cd-input w-full !h-11 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand text-sm';

/** "EDITAR CLIENTE" del header de identidad — mismos campos/estilo que el alta de
 * `Clients.tsx`, sobre `PUT /clients/:id` (ya existente, usado hoy por otras tarjetas). */
export default function EditClientModal({
  isOpen, client, onClose, onSave,
}: {
  isOpen: boolean;
  client: Client;
  onClose: () => void;
  onSave: (fields: Fields) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [fields, setFields] = useState<Fields>(() => fieldsOf(client));
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(fields);
      showToast('Cliente actualizado', 'success');
      onClose();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-overlay-in">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden animate-modal-in">
        <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-brand to-brand-gray text-white">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Editar Cliente</h2>
            <p className="text-white/70 text-xs font-bold uppercase tracking-wider mt-1">{client.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X size={24} /></button>
        </header>
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div className="space-y-1.5">
            <label className={LABEL}>Nombre de la empresa *</label>
            <input required type="text" className={INPUT} value={fields.name} onChange={set('name')} />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL}>Contacto principal</label>
            <input type="text" className={INPUT} value={fields.contact_name} onChange={set('contact_name')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={LABEL}>Teléfono</label>
              <input type="tel" className={INPUT} value={fields.contact_phone} onChange={set('contact_phone')} />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Email</label>
              <input type="email" className={INPUT} value={fields.contact_email} onChange={set('contact_email')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={LABEL}>País</label>
              <input type="text" className={INPUT} value={fields.country} onChange={set('country')} />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Ciudad / dirección</label>
              <input type="text" className={INPUT} value={fields.address} onChange={set('address')} />
            </div>
          </div>
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-6 py-3 rounded-xl bg-brand text-white font-extrabold hover:bg-brand-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
              {saving ? <Loader2 size={18} className="animate-spin" /> : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
