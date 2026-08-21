import { defineModel } from '../../types';

/** Lexmark X656de / X654de / X658de — MFP mono A4 con ADF, EWS clásico cgi-bin. */
export default defineModel({
  id: 'lexmark.x656de',
  brand: 'lexmark',
  displayName: 'Lexmark X656de',
  family: 'lexmark.cgi',
  match: { brand: 'lexmark', model: /\bX65[468]/i },
  expect: { color: false, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies'] },
  notes: 'PrinterStatus.html está localizado (ES/EN); el parser tolera "Tóner negro"/"Black Toner".',
});
