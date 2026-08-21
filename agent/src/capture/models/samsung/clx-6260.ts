import { defineModel } from '../../types';

/** Samsung CLX-6260FD/FR/ND — MFP color A4, SyncThru V6. Tóner + tambor por color y banda de transferencia. */
export default defineModel({
  id: 'samsung.clx-6260',
  brand: 'samsung',
  displayName: 'Samsung CLX-6260 Series',
  family: 'samsung.syncthru',
  match: { brand: 'samsung', model: /CLX-?626\d/i },
  expect: { color: true, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts', 'trays'] },
  notes: 'Color: mono = SIMPLEX_BW+DUPLEX_BW; color = SIMPLEX_COLOR+DUPLEX_COLOR. supplies.json incluye drum_<color> y btr_kit (transfer belt).',
});
