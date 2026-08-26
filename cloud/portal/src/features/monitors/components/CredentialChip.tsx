import { ShieldCheck } from 'lucide-react';
import type { MaskedSnmpCredential } from '../../../shared/types/monitor';
import { versionLabel } from './snmpCredentialsHelpers';

export default function CredentialChip({ masked }: { masked: MaskedSnmpCredential }) {
  const badges: string[] = [];
  if (masked.has_community) badges.push('community configurada');
  if (masked.has_auth_key) badges.push('auth configurada');
  if (masked.has_priv_key) badges.push('priv configurada');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-[2px] bg-surface-avatar px-2 py-0.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-650">
        {versionLabel(masked.version)}
      </span>
      <span className="font-sans text-[12.5px] font-semibold text-ink-700">
        {masked.label || masked.username || 'Sin nombre'}
      </span>
      {masked.username && masked.version === 'v3' && (
        <span className="font-mono text-[10px] text-ink-300">@{masked.username}</span>
      )}
      {badges.map((b) => (
        <span key={b} className="flex items-center gap-1 rounded-[2px] bg-brand-soft px-2 py-0.5 font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] text-brand-accent">
          <ShieldCheck size={10} /> {b}
        </span>
      ))}
    </div>
  );
}
