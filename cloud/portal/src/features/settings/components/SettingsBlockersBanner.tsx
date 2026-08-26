import { useEffect, useState } from 'react';
import DiagnosticBanner from '../../../shared/components/DiagnosticBanner';
import { api } from '../../../shared/lib/api';
import { fmt } from '../../../shared/lib/formatters';

interface EmailSummary { sinSmtp: number }

/** Banner de bloqueantes (handoff hifi #3, fase 2, 26/08/2026) — el mockup
 * muestra "2 ajustes sin configurar" (SMTP + automatización de datos
 * faltantes), pero la automatización no existe todavía como feature real
 * (ver `AutomationCard.tsx`) — mostrarla acá como "bloqueante resuelto por
 * RESOLVER AHORA" sería un botón que no hace nada. Sólo se diagnostica el
 * bloqueante real: SMTP sin configurar, con la cifra real de `/email-log/summary`. */
export default function SettingsBlockersBanner({ smtpConfigured }: { smtpConfigured: boolean }) {
  const [sinSmtp, setSinSmtp] = useState<number | null>(null);
  useEffect(() => {
    if (smtpConfigured) return;
    api.get<EmailSummary>('/email-log/summary').then((s) => setSinSmtp(s.sinSmtp)).catch(() => { /* informativo */ });
  }, [smtpConfigured]);
  if (smtpConfigured) return null;
  return (
    <DiagnosticBanner
      headline="SERVIDOR SMTP SIN CONFIGURAR — BLOQUEA LA OPERACIÓN"
      body={<>Sin servidor SMTP configurado, ningún aviso sale del sistema{sinSmtp != null ? <> (<strong className="font-semibold">{fmt(sinSmtp)}</strong> intentos fallidos por esta causa)</> : null}.</>}
      cta={{ label: 'RESOLVER AHORA', onClick: () => { document.getElementById('smtp-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }}
    />
  );
}
