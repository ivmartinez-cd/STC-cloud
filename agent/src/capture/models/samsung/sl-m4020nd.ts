import { defineModel } from '../../types';

/** Samsung ProXpress SL-M4020ND — láser mono A4, dúplex, sin ADF. SyncThru V6 JSON completo. */
export default defineModel({
  id: 'samsung.sl-m4020nd',
  brand: 'samsung',
  displayName: 'Samsung SL-M4020ND',
  family: 'samsung.syncthru',
  match: { brand: 'samsung', model: /SL-?M4020|M4020ND|SL-?M3820|SL-?M3320|M332x\s+382x\s+402x|\b402x\b/i },
  expect: { color: false, duplex: true, adf: false, scopes: ['identity', 'meters', 'supplies', 'alerts', 'trays'] },
  notes: 'Tóner all-in-one (sin tambor separado). supplies.json trae fuser/btr/rodillos con capa/remaining. counters.json expone GXI_BILLING_* simplex/duplex.',
});
