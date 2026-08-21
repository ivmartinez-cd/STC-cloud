import { defineModel } from '../../types';

/** HP Color LaserJet Pro MFP M479fdw/fdn/fnw (y M477/M478) — color A4 con ADF. Firmware LaserJet Pro (no FutureSmart). */
export default defineModel({
  id: 'hp.m479fdw',
  brand: 'hp',
  displayName: 'HP Color LaserJet Pro MFP M479fdw',
  family: 'hp.devmgmt',
  match: { brand: 'hp', model: /M479|M477|M478/i },
  expect: { color: true, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies'] },
  notes: 'ProductUsageDyn.xml trae TotalImpressions/Monochrome/Color. ConsumableConfigDyn.xml trae % y part number (W2030A…). No hay InternalPages (eso es FutureSmart).',
});
