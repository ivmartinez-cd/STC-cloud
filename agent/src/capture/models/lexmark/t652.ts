import { defineModel } from '../../types';

/** Lexmark T652dn — impresora mono A4, EWS clásico cgi-bin. */
export default defineModel({
  id: 'lexmark.t652',
  brand: 'lexmark',
  displayName: 'Lexmark T652',
  family: 'lexmark.cgi',
  match: { brand: 'lexmark', model: /\bT652/i },
  expect: { color: false, duplex: true, adf: false, scopes: ['identity', 'meters', 'supplies'] },
  notes: 'deviceinfo.html: "Page Count = N". OID privado total: 1.3.6.1.4.1.641.2.1.5.1.0.',
});
