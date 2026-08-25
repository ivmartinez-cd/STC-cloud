/** Estado de error por tarjeta (README, "Interactions & Behavior"): "la
 * tarjeta afectada muestra su título + 'No se pudo cargar' y un enlace
 * 'Reintentar' en #B4700B; el resto del panel sigue funcionando". Se usa
 * dentro del cuerpo de cada tarjeta — el título de la cabecera ya está
 * visible por fuera de este componente. */
export default function CardError({ onRetry, className = 'py-8' }: { onRetry?: () => void; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 text-center ${className}`}>
      <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
