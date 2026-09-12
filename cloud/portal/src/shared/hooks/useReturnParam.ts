import { useLocation } from 'react-router-dom';
import { returnParamFor } from '../lib/returnTo';

/**
 * `from=<url actual>` para pegar a un link hacia una ficha de detalle, de modo
 * que la ficha pueda volver a esta pantalla tal como está (los listados guardan
 * filtro/orden/página en la URL, así que el `from` los lleva gratis).
 *
 *   const returnParam = useReturnParam();
 *   <Link to={`/devices/${id}?${returnParam}`}>…</Link>
 */
export function useReturnParam(): string {
  const { pathname, search } = useLocation();
  return returnParamFor(pathname, search);
}
