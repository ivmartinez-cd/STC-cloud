import DiagnosticBanner from '../../../shared/components/DiagnosticBanner';
import { fmt } from '../../../shared/lib/formatters';
import type { EmailLogSummary } from '../types/emailLog';

function Body({ summary }: { summary: EmailLogSummary }) {
  return (
    <>
      De los {fmt(summary.intentos)} intentos del mes, <strong className="font-semibold">0 se entregaron</strong>. Dos causas:{' '}
      {fmt(summary.sinDestinatario)} clientes no tienen destinatario configurado y los {fmt(summary.sinSmtp)} que sí lo tienen fallan
      porque <strong className="font-semibold">no hay servidor SMTP configurado</strong>. Resolver el SMTP desbloquea {fmt(summary.sinSmtp)} avisos;
      el resto requiere cargar el contacto de cada cliente.
    </>
  );
}

/** "Ningún aviso se está entregando" (handoff hifi #3, 26/08/2026) — el cambio
 * de mayor valor de la pantalla: de 1.284 filas de `SIN DESTINATARIO`/`SIN SMTP`
 * a dos causas distintas, cuantificadas, con su acción real (navegación, no
 * botones sueltos). Sólo se muestra cuando hay algo roto (`entregados === 0`
 * con intentos en la ventana) — no tiene sentido alarmar si los avisos SÍ
 * están saliendo. */
export default function EmailLogBanner({ summary }: { summary: EmailLogSummary | null }) {
  if (!summary || summary.intentos === 0 || summary.entregados > 0) return null;
  return (
    <DiagnosticBanner
      headline="NINGÚN AVISO SE ESTÁ ENTREGANDO" body={<Body summary={summary} />}
      cta={[
        { label: 'VER CLIENTES SIN CONTACTO', to: '/clients?segment=sin_contacto' },
        { label: 'CONFIGURAR SMTP', to: '/settings' },
      ]}
    />
  );
}
