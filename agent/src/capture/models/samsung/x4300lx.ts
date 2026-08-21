import { defineModel } from '../../types';

/** Samsung MultiXpress X4300LX (color A3) / K4300LX (mono) / X4250, K4250 — plataforma XOA con Solution Web Service. */
export default defineModel({
  id: 'samsung.x4300lx',
  brand: 'samsung',
  displayName: 'Samsung MultiXpress X4300LX',
  family: 'samsung.sws',
  match: { brand: 'samsung', model: /X4300|K4300|X4250|K4250|X430\d|K430\d|X4300\s+Series/i },
  expect: { color: true, duplex: true, adf: true, scopes: ['identity', 'meters', 'supplies', 'alerts'] },
  notes: 'Los endpoints /sws/app/information/{home,supplies}.json redirigen (302) al login; counters.json y activealert.json siguen anónimos. Identidad desde homeDeviceInfo.sws (JS). K4300 es mono: el matcher lo incluye, el color se resuelve por los contadores reales.',
});
