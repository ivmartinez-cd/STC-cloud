import { Trash2 } from 'lucide-react';
import type { ApiKeyRecord } from '../../../shared/types/monitor';
import { isExpired } from './apiKeysHelpers';
import { APP_LOCALE } from '../../../shared/lib/formatters';

export default function ApiKeyRow({ k, canEdit, onRevoke }: { k: ApiKeyRecord; canEdit: boolean; onRevoke: (k: ApiKeyRecord) => void }) {
  const expired = isExpired(k);
  return (
    <div className="group flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-sans text-[13px] font-semibold text-ink-900">
          {k.name}
          {expired && (
            <span className="ml-2 rounded-[2px] bg-brand-soft px-1.5 py-0.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.08em] text-brand-severe">Vencida</span>
          )}
        </p>
        <p className="font-mono text-[10.5px] text-ink-300">
          {k.key_prefix}… {k.last_used_at ? `· usada ${new Date(k.last_used_at).toLocaleDateString(APP_LOCALE)}` : '· nunca usada'}
          {k.expires_at && ` · ${expired ? 'venció' : 'vence'} ${new Date(k.expires_at).toLocaleDateString(APP_LOCALE)}`}
        </p>
      </div>
      {canEdit && (
        <button onClick={() => onRevoke(k)}
          className="shrink-0 rounded-[3px] p-2 text-ink-200 opacity-0 transition-colors duration-150 ease-in-out hover:bg-brand-soft hover:text-brand-severe group-hover:opacity-100">
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
