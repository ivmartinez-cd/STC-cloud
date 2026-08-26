import type { SnmpVersion, SnmpSecurityLevel, SnmpAuthProtocol, SnmpPrivProtocol } from '../../../shared/types/monitor';
import { AUTH_PROTOCOLS, PRIV_PROTOCOLS, SECURITY_LEVELS, LABEL, INPUT, type Draft } from './snmpCredentialsHelpers';

export default function SnmpCredentialDraftForm({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  return (
    <div className="space-y-3.5 border-t border-line-150 pt-3.5">
      <div className="grid grid-cols-2 gap-3.5">
        <div className="space-y-1.5">
          <label className={LABEL}>Versión</label>
          <select value={draft.version} onChange={(e) => onChange({ version: e.target.value as SnmpVersion })}
            className={`${INPUT} font-semibold`}>
            <option value="v2c">v2c (community)</option>
            <option value="v1">v1 (community)</option>
            <option value="v3">v3 (USM)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={LABEL}>Etiqueta (opcional)</label>
          <input type="text" value={draft.label} onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Ej: Corporativa"
            className={INPUT} />
        </div>
      </div>

      {(draft.version === 'v1' || draft.version === 'v2c') && (
        <div className="space-y-1.5">
          <label className={LABEL}>Community</label>
          <input type="text" value={draft.community} onChange={(e) => onChange({ community: e.target.value })}
            className={`${INPUT} font-mono`} />
        </div>
      )}

      {draft.version === 'v3' && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className={LABEL}>Username</label>
              <input type="text" value={draft.username} onChange={(e) => onChange({ username: e.target.value })}
                className={`${INPUT} font-mono`} />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Nivel de seguridad</label>
              <select value={draft.security_level} onChange={(e) => onChange({ security_level: e.target.value as SnmpSecurityLevel })}
                className={`${INPUT} font-semibold`}>
                {SECURITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {draft.security_level !== 'noAuthNoPriv' && (
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className={LABEL}>Protocolo auth</label>
                <select value={draft.auth_protocol} onChange={(e) => onChange({ auth_protocol: e.target.value as SnmpAuthProtocol })}
                  className={`${INPUT} font-semibold`}>
                  {AUTH_PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={LABEL}>Auth key (≥ 8 caracteres)</label>
                <input type="password" autoComplete="new-password" value={draft.auth_key} onChange={(e) => onChange({ auth_key: e.target.value })}
                  className={`${INPUT} font-mono`} />
              </div>
            </div>
          )}

          {draft.security_level === 'authPriv' && (
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className={LABEL}>Protocolo priv</label>
                <select value={draft.priv_protocol} onChange={(e) => onChange({ priv_protocol: e.target.value as SnmpPrivProtocol })}
                  className={`${INPUT} font-semibold`}>
                  {PRIV_PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={LABEL}>Priv key (≥ 8 caracteres)</label>
                <input type="password" autoComplete="new-password" value={draft.priv_key} onChange={(e) => onChange({ priv_key: e.target.value })}
                  className={`${INPUT} font-mono`} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
