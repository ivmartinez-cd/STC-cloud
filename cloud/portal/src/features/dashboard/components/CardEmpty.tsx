/** Empty state por tarjeta (README): texto Source Sans 3 400 12.5px `#9FA4A7`
 * centrado. */
export default function CardEmpty({ text = 'Sin datos para el período', className = 'py-8' }: { text?: string; className?: string }) {
  return <p className={`text-center font-sans text-[12.5px] text-ink-300 ${className}`}>{text}</p>;
}
