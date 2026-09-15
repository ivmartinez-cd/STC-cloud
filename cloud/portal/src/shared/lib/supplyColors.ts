import type { SupplyColor } from '../types/supplies';

/** Swatch desaturado del color real del cartucho (handoff hifi #3, §1 punto 6)
 * — nunca puntos saturados. Único lugar donde vive el mapa: antes estaba
 * duplicado en la tabla de Consumibles y en la del detalle del dispositivo. */
export const SWATCH_HEX: Record<SupplyColor, string> = {
  Negro: '#2E3033',
  Cian: '#7FB8C4',
  Magenta: '#C48BA8',
  Amarillo: '#E8C776',
  'Sin color': '#DDE1E2',
};
