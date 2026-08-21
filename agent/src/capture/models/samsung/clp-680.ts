import { defineModel } from '../../types';

/** Samsung CLP-680ND/DW — impresora color A4 (sin ADF). SyncThru V6. */
export default defineModel({
  id: 'samsung.clp-680',
  brand: 'samsung',
  displayName: 'Samsung CLP-680 Series',
  family: 'samsung.syncthru',
  match: { brand: 'samsung', model: /CLP-?68\d/i },
  expect: { color: true, duplex: true, adf: false, scopes: ['identity', 'meters', 'supplies', 'alerts', 'trays'] },
  notes: 'PJL sólo devuelve PAGECOUNT total; nunca usar pjl como método principal en este modelo (perdería el desglose color). Ver samsung_counters_investigation_report.md.',
});
