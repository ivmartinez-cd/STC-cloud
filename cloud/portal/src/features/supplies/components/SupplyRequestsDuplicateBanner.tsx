import DiagnosticBanner from '../../../shared/components/DiagnosticBanner';
import type { SupplyRequest } from '../types/supplyRequests';

interface Props {
  request: SupplyRequest;
  sibling: SupplyRequest | undefined;
  onReview: (id: string) => void;
}

/** Banner de duplicado (handoff hifi #3, fase 3, 26/08/2026) — sale de
 * `possible_duplicate_of`, calculado en servidor sobre pedidos ABIERTOS del
 * mismo (device_id, supply_key) — ver `KnexSupplyRequestRepository.
 * duplicateSiblingIds`. Sólo se arma si el par sigue cargado en la página
 * actual (no hay endpoint aparte "todos los duplicados de la cuenta"). */
export default function SupplyRequestsDuplicateBanner({ request, sibling, onReview }: Props) {
  const target = sibling ?? request;
  const body = (
    <>
      Ambos son del mismo equipo (<strong className="font-semibold">{request.device_serial ?? request.device_label ?? 'equipo sin identificar'}</strong>) y
      describen el mismo consumible ({request.description ?? request.supply_kind}). Probablemente sean un duplicado: revisá antes de tramitarlos.
    </>
  );
  return (
    <DiagnosticBanner
      headline="2 PEDIDOS PARA EL MISMO CONSUMIBLE" body={body}
      cta={{ label: 'REVISAR', onClick: () => onReview(target.id) }}
    />
  );
}
