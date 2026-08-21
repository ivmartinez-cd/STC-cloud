import { defineModel } from '../../types';

/** HP Color LaserJet Managed MFP E78625/E78630/E78635 — color A3, FutureSmart 5. */
export default defineModel({
  id: 'hp.e78625',
  brand: 'hp',
  displayName: 'HP Color LaserJet MFP E78625',
  family: 'hp.futuresmart',
  match: { brand: 'hp', model: /E786\d\d/i },
  expect: { color: true, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts'] },
  notes: 'FutureSmart 5 A3. Contadores SNMP; equivalentes A4 en UsagePage (no se usan como total).',
});
