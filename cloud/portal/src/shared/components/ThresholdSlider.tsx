interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  accent?: 'brand' | 'severe';
  unit?: string;
  helpText: string;
  onChange: (v: number) => void;
}

/** Slider de umbral con impacto escrito debajo (handoff hifi #3, 26/08/2026) —
 * extraído de `features/monitors/components/ConfigTabPanel.tsx:124-133`,
 * único slider del portal hasta ahora. `helpText` es el texto de impacto que
 * el handoff pide reemplazando los inputs pelados ("Con el valor actual, 875
 * de 876 monitores quedan marcados sin señal") — lo arma el caller con datos
 * reales del endpoint de impacto, este componente no calcula nada. */
export default function ThresholdSlider({ label, value, min, max, accent = 'brand', unit = '%', helpText, onChange }: Props) {
  const valueClass = accent === 'severe' ? 'text-brand-severe' : 'text-brand-accent';
  const trackAccent = accent === 'severe' ? 'accent-brand-severe' : 'accent-brand';
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">{label}</label>
        <span className={`font-montserrat text-[12.5px] font-semibold tabular-nums ${valueClass}`}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className={`h-1.5 w-full cursor-pointer appearance-none rounded-[3px] bg-surface-track ${trackAccent}`}
      />
      <p className="mt-1.5 font-sans text-[11.5px] leading-[1.5] text-ink-300">{helpText}</p>
    </div>
  );
}
