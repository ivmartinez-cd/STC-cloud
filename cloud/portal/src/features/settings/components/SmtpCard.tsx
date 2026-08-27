import { useState } from 'react';
import EstadoChip from '../../../shared/components/EstadoChip';
import { BTN_PRIMARY_SM, BTN_SECONDARY_SM } from '../../../shared/lib/buttons';
import type { SettingsDraft, SystemSettingsFormState } from '../hooks/useSystemSettingsForm';

const INPUT = 'w-full rounded-[3px] border px-3 py-2.5 font-sans text-[12.5px] text-ink-900 outline-none focus:border-brand';
const LABEL = 'mb-2 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';

function Field({ label, value, onChange, placeholder, mono, disabled }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; mono?: boolean; disabled?: boolean;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <input
        type="text" value={value} placeholder={placeholder} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} ${mono ? 'font-mono' : ''} ${value ? 'border-line-100 bg-surface-input' : 'border-brand-chip-border bg-white placeholder:text-ink-200'}`}
      />
    </div>
  );
}

function EncryptionField({ draft, disabled, onChange }: { draft: SettingsDraft; disabled: boolean; onChange: (p: Partial<SettingsDraft>) => void }) {
  return (
    <div>
      <label className={LABEL}>CIFRADO</label>
      <select
        value={draft.smtpEncryption} disabled={disabled}
        onChange={(e) => onChange({ smtpEncryption: e.target.value as SettingsDraft['smtpEncryption'] })}
        className={`${INPUT} border-line-100 bg-white`}
      >
        <option value="starttls">STARTTLS</option>
        <option value="tls">TLS</option>
        <option value="none">Ninguno</option>
      </select>
    </div>
  );
}

function SmtpFields({ draft, disabled, onChange }: { draft: SettingsDraft; disabled: boolean; onChange: (p: Partial<SettingsDraft>) => void }) {
  return (
    <div className="mb-4 short:mb-3 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3.5">
      <Field label="SERVIDOR SMTP" value={draft.smtpHost} onChange={(v) => onChange({ smtpHost: v })} placeholder="Sin definir" disabled={disabled} />
      <Field label="PUERTO" value={draft.smtpPort} onChange={(v) => onChange({ smtpPort: v.replace(/\D/g, '') })} placeholder="587" mono disabled={disabled} />
      <Field label="USUARIO" value={draft.smtpUser} onChange={(v) => onChange({ smtpUser: v })} placeholder="Sin definir" disabled={disabled} />
      <Field label="REMITENTE" value={draft.smtpFrom} onChange={(v) => onChange({ smtpFrom: v })} placeholder="Sin definir" disabled={disabled} />
      <EncryptionField draft={draft} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function PasswordField({ draft, passwordSet, disabled, onChange }: { draft: SettingsDraft; passwordSet: boolean; disabled: boolean; onChange: (p: Partial<SettingsDraft>) => void }) {
  return (
    <div className="mb-4">
      <label className={LABEL}>CONTRASEÑA</label>
      <input
        type="password" value={draft.smtpPassword} disabled={disabled}
        onChange={(e) => onChange({ smtpPassword: e.target.value })}
        placeholder={passwordSet ? '•••••••• (guardada — dejar vacío para no cambiarla)' : 'Sin definir'}
        className={`${INPUT} ${passwordSet ? 'border-line-100 bg-surface-input' : 'border-brand-chip-border bg-white'} max-w-xs`}
      />
    </div>
  );
}

function TestActions({ s }: { s: SystemSettingsFormState }) {
  const [testTo, setTestTo] = useState('');
  return (
    <div className="mt-auto flex flex-wrap items-center gap-2.5">
      <button type="button" onClick={() => void s.saveAndTest()} disabled={s.saving} className={BTN_PRIMARY_SM}>GUARDAR Y PROBAR</button>
      <input
        type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="email de prueba…"
        className="w-[190px] rounded-[3px] border border-line-100 bg-surface-input px-3 py-2 font-sans text-[12px] text-ink-900 outline-none focus:border-brand"
      />
      <button type="button" onClick={() => void s.testSmtp(testTo)} disabled={!testTo || s.saving} className={BTN_SECONDARY_SM}>ENVIAR PRUEBA</button>
    </div>
  );
}

interface Props { s: SystemSettingsFormState; disabled: boolean }

/** "Notificaciones por correo" (handoff hifi #3, fase 2, 26/08/2026) —
 * reemplaza `SmtpInfoCard.tsx`: antes era de sólo lectura ("las credenciales
 * reales se gestionan por .env"), ahora el SMTP vive en `system_settings`
 * (cifrado at-rest, `cryptoService.ts` purpose `smtp`) y es editable de
 * verdad. `GUARDAR Y PROBAR` guarda y llama `POST .../smtp/test` sin `to`
 * (sólo verifica conexión); `ENVIAR PRUEBA` manda un email real al
 * destinatario tipeado — usa la config YA GUARDADA, por eso pide guardar antes. */
function CardHeader({ configured }: { configured: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-150 px-5 py-[14px]">
      <div>
        <div className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">NOTIFICACIONES POR CORREO</div>
        <div className="mt-[5px] font-sans text-[11.5px] text-ink-300">Servidor de salida para alertas, pedidos e informes</div>
      </div>
      <EstadoChip label={configured ? 'CONFIGURADO' : 'SIN CONFIGURAR'} variant={configured ? 'neutral' : 'attention'} />
    </div>
  );
}

function SecurityNote() {
  return (
    <div className="mb-4 flex items-start gap-[11px] rounded-[3px] border border-brand-chip-border bg-brand-soft p-[13px]">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand font-montserrat text-[11px] font-bold text-white">!</span>
      <div className="font-sans text-[12px] leading-[1.5] text-brand-warn-text">
        La contraseña se guarda cifrada y no vuelve a mostrarse. Usá una cuenta de servicio dedicada, no una casilla personal.
      </div>
    </div>
  );
}

function CardBody({ s, disabled }: Props & { s: SystemSettingsFormState & { draft: SettingsDraft } }) {
  return (
    <div className="flex flex-1 flex-col px-5 py-[18px]">
      <SmtpFields draft={s.draft} disabled={disabled} onChange={s.update} />
      <PasswordField draft={s.draft} passwordSet={s.view?.smtp_password_set ?? false} disabled={disabled} onChange={s.update} />
      <SecurityNote />
      {disabled ? null : <TestActions s={s} />}
    </div>
  );
}

export default function SmtpCard({ s, disabled }: Props) {
  if (!s.draft) return null;
  const configured = !!s.view?.smtp_host;
  return (
    <div id="smtp-card" className={`flex flex-col rounded-[5px] border border-line-100 border-t-[3px] bg-white ${configured ? 'border-t-ink-500' : 'border-t-brand-severe'}`}>
      <CardHeader configured={configured} />
      <CardBody s={s as SystemSettingsFormState & { draft: SettingsDraft }} disabled={disabled} />
    </div>
  );
}
