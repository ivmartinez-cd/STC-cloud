import { defineModel } from '../../types';

/** HP LaserJet Pro MFP M428fdw/fdn/dw (y M429) — MFP mono A4 con ADF. Firmware LaserJet Pro (DevMgmt XML). */
export default defineModel({
  id: 'hp.m428fdw',
  brand: 'hp',
  displayName: 'HP LaserJet Pro MFP M428fdw',
  family: 'hp.devmgmt',
  match: { brand: 'hp', model: /M428|M429/i },
  expect: { color: false, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies'] },
  notes: 'sysDescr dice "HP ETHERNET MULTI-ENVIRONMENT" (ruido de la JetDirect embebida): el modelo real está en hrDeviceDescr y en el Device ID 1284 (MDL:). hpPrinterModel devuelve el 1284 completo.',
});
