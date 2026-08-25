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

const LABEL = 'mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';
const INPUT = 'w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand';

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-overlay-in" style={{ background: 'rgba(20,20,20,.55)' }}>
      <div style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }} className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[5px] bg-white animate-modal-in">
        <header className="flex items-center justify-between border-b border-line-150 px-6 py-4">
          <div>
            <h2 className="font-montserrat text-[18px] font-extrabold tracking-[-.01em] text-ink-900">Editar Cliente</h2>
            <p className="mt-0.5 font-sans text-[11.5px] text-ink-300">{client.name}</p>
          </div>
          <button onClick={onClose} className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600"><X size={20} /></button>
        </header>
        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <div>
            <label className={LABEL}>Nombre de la empresa *</label>
            <input required type="text" className={INPUT} value={fields.name} onChange={set('name')} />
          </div>
          <div>
            <label className={LABEL}>Contacto principal</label>
            <input type="text" className={INPUT} value={fields.contact_name} onChange={set('contact_name')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Teléfono</label>
              <input type="tel" className={INPUT} value={fields.contact_phone} onChange={set('contact_phone')} />
            </div>
            <div>
              <label className={LABEL}>Email</label>
              <input type="email" className={INPUT} value={fields.contact_email} onChange={set('contact_email')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>País</label>
              <input type="text" className={INPUT} value={fields.country} onChange={set('country')} />
            </div>
            <div>
              <label className={LABEL}>Ciudad / dirección</label>
              <input type="text" className={INPUT} value={fields.address} onChange={set('address')} />
            </div>
          </div>
          <div className="flex gap-3 pt-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
