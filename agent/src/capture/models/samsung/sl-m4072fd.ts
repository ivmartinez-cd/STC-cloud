import { defineModel } from '../../types';
import type { CaptureResult } from '../../types';

/** Samsung ProXpress SL-M4072FD — MFP mono A4 con ADF (50 hojas), fax y dúplex. Mismo firmware SyncThru que SL-M4020. */
export default defineModel({
  id: 'samsung.sl-m4072fd',
  brand: 'samsung',
  displayName: 'Samsung SL-M4072FD',
  family: 'samsung.syncthru',
  match: { brand: 'samsung', model: /SL-?M4072|M4072FD|SL-?M4070|SL-?M3870|M337x\s+387x\s+407x|\b407x\b/i },
  expect: { color: false, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts', 'trays'] },
  hooks: {
    afterCollect(result: CaptureResult): CaptureResult {
      // El ADF no aparece en home.json como bandeja: lo declaramos fijo para que el portal lo muestre.
      if (result.trays?.input && !result.trays.input.some(t => /ADF/i.test(t.name))) {
        result.trays.input.push({ name: 'ADF Feeder', paperType: 'Plain', paperSize: 'A4', capacity: 50, level: 100, status: 'Ready' });
      }
      return result;
    },
  },
  notes: 'Los contadores de copia/escaneo/fax están en counters.json (GXI_BILLING_*_COPY_CNT) pero el portal sólo persiste total/mono/color + detail.',
});
