import { defineModel } from '../../types';

/** Samsung SCX-4833FD / 4835FR / 5637FR / 5737FW (familia "SCX-483x 5x3x Series") — MFP mono con ADF, SyncThru V5. */
export default defineModel({
  id: 'samsung.scx-483x',
  brand: 'samsung',
  displayName: 'Samsung SCX-483x / 5x3x Series',
  family: 'samsung.syncthru',
  match: { brand: 'samsung', model: /SCX-?48[3-4]\d|SCX-?5[67]3\d|SCX-?483x|5x3x/i },
  expect: { color: false, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts'] },
  notes: 'SyncThru V5: counters.json puede no traer GXI_BILLING_TOTAL_IMP_CNT; el total se compone de simplex+duplex. OID alternativo de total: 1.3.6.1.4.1.236.11.5.11.53.11.2.1.2.1.2.1.',
});
