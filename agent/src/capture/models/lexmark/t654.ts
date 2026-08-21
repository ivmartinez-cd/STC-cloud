import { defineModel } from '../../types';

/** Lexmark T654dn — impresora mono A4 (55 ppm), EWS clásico cgi-bin. */
export default defineModel({
  id: 'lexmark.t654',
  brand: 'lexmark',
  displayName: 'Lexmark T654',
  family: 'lexmark.cgi',
  match: { brand: 'lexmark', model: /\bT654/i },
  expect: { color: false, duplex: true, adf: false, scopes: ['identity', 'meters', 'supplies'] },
});
