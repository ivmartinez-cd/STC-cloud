import type { ReactNode } from 'react';

/**
 * Envuelve la celda de NIVEL RESTANTE para abrir "Detalles del consumible"
 * (paridad con el SDS: tocar el porcentaje abre el histórico del insumo).
 * Sin `onOpen` renderiza la barra tal cual — así la misma tabla sirve donde
 * el modal no aplica. El área clickeable es toda la celda, no sólo el número.
 */
export default function SupplyLevelButton({ onOpen, label, children }: {
  onOpen?: () => void; label: string; children: ReactNode;
}) {
  if (!onOpen) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Ver detalles del consumible"
      aria-label={`Ver detalles de ${label}`}
      className="-mx-1.5 min-w-0 cursor-pointer rounded-[3px] px-1.5 py-1 text-left transition-colors duration-150 ease-in-out hover:bg-brand-soft focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
    >
      {children}
    </button>
  );
}
