import { defineModel } from '../../types';
import type { CaptureResult } from '../../types';

/**
 * HP LaserJet MFP M432fdn — motor Samsung: el EWS es SWS/SyncThru (no DevMgmt HP clásico).
 * Verificado contra un equipo real (192.168.178.16, firmware V4.00.01.28 APR-05-2022): responde
 * exactamente los mismos endpoints JSON sin sesión que `families/samsung-syncthru.ts`
 * (`/sws/app/information/{home,counters,supplies,activealert}.json`,
 * `/sws/app/maintenance/fw/fwupgrade.json`); `/DevMgmt/*.xml` no existe (404). El firmware se
 * identifica a sí mismo como "HP Laser MFP 432fdn" (sin "Jet" ni "M" — nomenclatura Samsung
 * heredada tras la compra de la división de impresión de Samsung por HP en 2017).
 */
export default defineModel({
  id: 'hp.m432',
  brand: 'hp',
  displayName: 'HP LaserJet MFP M432fdn',
  family: 'samsung.syncthru',
  match: { brand: 'hp', model: /\bM?432(fdn|fdw|f)?\b/i },
  expect: { color: false, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts', 'trays'] },
  hooks: {
    afterCollect(result: CaptureResult): CaptureResult {
      // La familia samsung.syncthru fuerza brand:'samsung' en su acumulador interno (hoy todos sus
      // demás perfiles son Samsung): corregimos a la marca comercial real del equipo.
      if (result.identity) result.identity.brand = 'hp';
      // El ADF (fax + adf_dadf:1 en home.json) no aparece como bandeja, igual que en el motor
      // Samsung nativo (ver samsung/sl-m4072fd.ts).
      if (result.trays?.input && !result.trays.input.some(t => /ADF/i.test(t.name))) {
        result.trays.input.push({ name: 'ADF Feeder', paperType: 'Plain', paperSize: 'A4', capacity: 50, level: 100, status: 'Ready' });
      }
      return result;
    },
  },
  notes: 'Firmware Samsung SWS/SyncThru rebrandeado. Sin auth. GXI_BILLING_TOTAL_IMP_CNT en counters.json es el contador de confianza (igual que en Samsung).',
});
