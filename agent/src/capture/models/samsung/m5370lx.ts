import { defineModel } from '../../types';

/** Samsung MultiXpress SL-M5370LX — MFP mono A4 (XOA / Solution Web Service). */
export default defineModel({
  id: 'samsung.m5370lx',
  brand: 'samsung',
  displayName: 'Samsung MultiXpress SL-M5370LX',
  family: 'samsung.sws',
  match: { brand: 'samsung', model: /SL-?M5370|M5370LX|SL-?M4370|SL-?M5360|M4370\s+5370|\b5370\b/i },
  expect: { color: false, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts'] },
  notes: 'home.json responde parcialmente (tóner negro) pero counters.json clásico puede faltar; countersView.sws (HTML) es la fuente de contadores. Si SWS no da total, el motor completa con Printer-MIB (prtMarkerLifeCount).',
});
