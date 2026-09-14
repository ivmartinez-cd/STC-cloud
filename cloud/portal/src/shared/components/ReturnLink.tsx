import { Link, useSearchParams } from 'react-router-dom';
import { returnToLabel, safeReturnTo } from '../lib/returnTo';

/**
 * "← Volver a X" para los listados a los que se llega desde una ficha con
 * `?from=` (auditoría de navegación, 14/09/2026: Alertas, Consumibles y
 * Pendientes se abrían filtrados desde Cliente/Equipo pero sin forma de volver
 * más que el botón atrás del navegador). Sin `from` no renderiza nada.
 * `safeReturnTo` es la única validación de destino: rechaza `//evil`, esquemas
 * externos y travesías.
 */
export default function ReturnLink() {
  const [searchParams] = useSearchParams();
  const backTo = safeReturnTo(searchParams.get('from'));
  if (!backTo) return null;
  return (
    <nav className="mb-3 short:mb-2 font-sans text-xs">
      <Link to={backTo} className="font-semibold text-brand-accent hover:underline">← Volver a {returnToLabel(backTo)}</Link>
    </nav>
  );
}
