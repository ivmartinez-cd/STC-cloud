import { defineModel } from '../../types';

/** HP LaserJet Managed E40040dn — impresora mono A4, FutureSmart 5. */
export default defineModel({
  id: 'hp.e40040',
  brand: 'hp',
  displayName: 'HP LaserJet E40040',
  family: 'hp.futuresmart',
  match: { brand: 'hp', model: /E400\d\d/i },
  expect: { color: false, duplex: true, adf: false, scopes: ['identity', 'meters', 'supplies', 'alerts'] },
  notes: 'FutureSmart 5. Igual que E47528: DeviceInformation/View + ConfigurationPage + UsagePage + SuppliesStatus; contadores SNMP.',
});
