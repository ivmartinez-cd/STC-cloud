/**
 * Canal de actualización del agente — 'stable' (runtime moderno, Node 24 /
 * .NET 9) o 'legacy' (Node 20.2.0 / .NET Framework 4.8, ver
 * agent/build-sea.js --channel y STC-Monitor-Legacy.iss). Se embebe en build
 * time vía esbuild --define (no es una variable de entorno: el runtime que
 * corre el bundle ya está fijado desde que se compiló, no puede "decidir"
 * otro canal en caliente).
 *
 * En dev (`tsx watch`, sin bundlear) __STC_CHANNEL__ no existe como global —
 * el fallback a 'stable' es intencional.
 */
declare const __STC_CHANNEL__: string | undefined;

export const CHANNEL: 'stable' | 'legacy' =
  (typeof __STC_CHANNEL__ !== 'undefined' && __STC_CHANNEL__ === 'legacy') ? 'legacy' : 'stable';
