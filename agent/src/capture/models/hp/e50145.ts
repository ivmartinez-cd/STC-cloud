import { defineModel } from '../../types';

/** HP LaserJet Managed E50145dn — impresora mono A4, FutureSmart 4/5. */
export default defineModel({
  id: 'hp.e50145',
  brand: 'hp',
  displayName: 'HP LaserJet E50145',
  family: 'hp.futuresmart',
  match: { brand: 'hp', model: /E501\d\d/i },
  expect: { color: false, duplex: true, adf: false, scopes: ['identity', 'meters', 'supplies', 'alerts'] },
  notes: 'En flota se observó tóner null: ConsumableConfigDyn.xml puede responder 401 según política; el motor completa con prtMarkerSuppliesTable (SNMP).',
});
