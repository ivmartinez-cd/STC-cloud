import { defineModel } from '../../types';

/** HP LaserJet Managed MFP E52645dn/c — MFP mono A4 con ADF, FutureSmart 5. */
export default defineModel({
  id: 'hp.e52645',
  brand: 'hp',
  displayName: 'HP LaserJet MFP E52645',
  family: 'hp.futuresmart',
  match: { brand: 'hp', model: /E526\d\d/i },
  expect: { color: false, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts'] },
  notes: 'Si el EWS redirige a /hp/device/SignIn, la familia intenta sesión "Administrator" sin contraseña (fábrica). Si el equipo tiene contraseña (409, caso 192.168.178.44) cae a Printer-MIB: contadores por prtMarkerLifeCount, tóner por prtMarkerSuppliesTable y firmware por 1.3.6.1.4.1.11.2.3.9.4.2.1.1.3.6.0.',
});
