import { defineModel } from '../../types';

/** HP Color LaserJet Managed MFP E47528f — color A4, FutureSmart 5, ADF. */
export default defineModel({
  id: 'hp.e47528',
  brand: 'hp',
  displayName: 'HP Color LaserJet MFP E47528',
  family: 'hp.futuresmart',
  match: { brand: 'hp', model: /E475\d\d/i },
  expect: { color: true, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts'] },
  notes: 'FutureSmart 5 sin /DevMgmt (404): identidad por DeviceInformation/View (SKU 3QA75A, alias, ubicación), firmware por ConfigurationPage (revisión + datecode) y SNMP, contadores SNMP (1170/332/838 = SDS), desglose por UsagePage, consumibles por SuppliesStatus (part number 414A W2020A, nº pedido W9090MC, serial CRUM, páginas restantes).',
});
