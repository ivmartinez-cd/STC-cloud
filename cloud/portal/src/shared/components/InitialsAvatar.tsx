import { initialsOf } from '../lib/identity';

/** Clases literales por tamaño (Tailwind no genera `h-[${n}px]` dinámico).
 * Cubre los 4 tamaños ya usados en el portal: 24/26/32/52px. */
const SIZE_CLASSES: Record<24 | 26 | 32 | 52, string> = {
  24: 'h-6 w-6 text-[9px]',
  26: 'h-[26px] w-[26px] text-[9.5px]',
  32: 'h-8 w-8 text-[10.5px]',
  52: 'h-[52px] w-[52px] text-[19px]',
};

interface Props {
  name: string;
  size?: 24 | 26 | 32 | 52;
  variant?: 'neutral' | 'brand';
}

/** Avatar de iniciales (handoff hifi #3, 26/08/2026) — promovido de las 4
 * copias de `initialsOf()` + markup en `ClientsDirectoryTable.tsx`,
 * `DeviceGroupHeaderRow.tsx`, `DeviceProfileCard.tsx`, `ClientProfileCard.tsx`.
 * `variant="brand"` es el naranja suave que usa la cabecera de grupo. */
export default function InitialsAvatar({ name, size = 32, variant = 'neutral' }: Props) {
  const palette = variant === 'brand' ? 'border-brand-chip-border bg-brand-soft text-brand-accent' : 'border-line-avatar bg-surface-avatar text-ink-400';
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-[3px] border font-montserrat font-bold ${SIZE_CLASSES[size]} ${palette}`}>
      {initialsOf(name)}
    </span>
  );
}
