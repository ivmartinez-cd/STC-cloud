/**
 * Canal de actualización del agente contra el runtime con el que realmente
 * está corriendo. Lógica pura (sin React) — testeada en
 * `cloud/portal/tests/updateChannel.test.ts`.
 *
 * Por qué esto merece una fila propia en la ficha: el canal se **hornea en
 * build time** (`agent/build-sea.js --channel`) y el runtime lo reporta el
 * proceso vivo en cada heartbeat. Si no se corresponden, el agente le pide al
 * server el release del canal equivocado, se lo instala —pasa el hash y la
 * firma, porque el paquete es legítimo— y el servicio se reinicia con un
 * bundle que su Node no sabe ejecutar. El agente no vuelve a levantar y no
 * hay alerta que lo avise: deja de reportar y parece una caída de red.
 *
 * Pasó de verdad: hasta el 13/09/2026 `build-installer-legacy.bat` compilaba
 * sin `--channel legacy`, así que el agente de ISSN (Windows 7, Node 20.2.0)
 * figuraba como `stable` en el portal y pedía los releases compilados para
 * Node 24.
 */

/** Mayor de Node con el que se compila cada canal (`build-sea.js --target`). */
const EXPECTED_NODE_MAJOR: Record<string, number> = { stable: 24, legacy: 20 };

export interface UpdateChannelInfo {
  /** Texto para la fila: `legacy · Node v20.2.0`. */
  value: string;
  /** El canal declarado no se corresponde con el runtime que reporta el proceso. */
  mismatch: boolean;
  /** Explicación para el operador; `null` cuando no hay problema. */
  warning: string | null;
}

function nodeMajorOf(runtime: string | null | undefined): number | null {
  const match = /^v?(\d+)\./.exec((runtime ?? "").trim());
  return match ? Number(match[1]) : null;
}

export function updateChannelInfo(channel: string | null | undefined, runtime: string | null | undefined): UpdateChannelInfo {
  const name = (channel ?? "").trim().toLowerCase();
  const value = [name || "—", runtime ? `Node ${runtime}` : null].filter(Boolean).join(" · ");
  const expected = EXPECTED_NODE_MAJOR[name];
  const actual = nodeMajorOf(runtime);
  // Sin uno de los dos datos no se afirma nada: un agente viejo que no reporta
  // runtime no tiene por qué aparecer en rojo.
  if (expected === undefined || actual === null || expected === actual) {
    return { value, mismatch: false, warning: null };
  }
  return {
    value,
    mismatch: true,
    warning:
      `Declara el canal "${name}" (se compila para Node ${expected}) pero corre Node ${actual}. ` +
      `La próxima actualización de ese canal puede dejar el agente sin arrancar: revisá con qué --channel se compiló el instalador.`,
  };
}
