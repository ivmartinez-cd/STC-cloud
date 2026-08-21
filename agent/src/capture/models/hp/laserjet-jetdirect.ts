import { defineModel } from '../../types';

/**
 * HP LaserJet legado con JetDirect embebido (LaserJet 4200/4250/4350, P3005/P3015, 600 M601–M603, M4555…).
 * Se reconocen por sysDescr "HP ETHERNET MULTI-ENVIRONMENT" — el modelo real viene de hrDeviceDescr / hpPrinterModel.
 */
export default defineModel({
  id: 'hp.laserjet-jetdirect',
  brand: 'hp',
  displayName: 'HP LaserJet (JetDirect legado)',
  family: 'hp.jetdirect-legacy',
  match: {
    brand: 'hp',
    model: /ETHERNET MULTI-ENVIRONMENT|JetDirect|LaserJet\s+(?:4[023]\d\d|P[234]\d{3}|600\s*M60\d|M60[123]|M[45]\d{3}|P1\d{3}|M1\d{3})/i,
    // Pro / FutureSmart modernos (M4xx, M5xx, E-series) usan hp.devmgmt aunque su sysDescr diga "ETHERNET MULTI-ENVIRONMENT"
    exclude: /LaserJet\s+Pro|\bE\d{5}\b|\bM[2-5]\d\d[a-z]*\b|FutureSmart/i,
  },
  expect: { color: false, duplex: true, adf: false, scopes: ['identity', 'meters', 'supplies', 'alerts', 'trays'] },
  notes: 'Nunca reportar "HP ETHERNET MULTI-ENVIRONMENT" como modelo: es la descripción de la tarjeta de red.',
});
