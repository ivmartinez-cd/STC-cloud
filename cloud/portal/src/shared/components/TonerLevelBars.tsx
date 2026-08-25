import SupplyLevelBar from './SupplyLevelBar';

/** Color real de cada tóner (no de severidad) — mismos hex que la tabla de
 * Consumibles del dispositivo (`SWATCH_HEX` en `SuppliesTable.tsx`). */
const TONER_HEX = { black: '#2E3033', cyan: '#7FB8C4', magenta: '#C48BA8', yellow: '#E8C776' } as const;

interface Props {
  black: number | null;
  cyan: number | null;
  magenta: number | null;
  yellow: number | null;
}

/** Nivel de consumibles en el listado de equipos: un equipo color pinta 4
 * mini-barras (una por tóner, con su color real) en vez de una sola barra
 * agregada — funcionalidad real que existía antes del rediseño hifi y se
 * había perdido (la tabla sólo traía el mínimo). Un equipo monocromo (sin
 * cian/magenta/amarillo) sigue mostrando una única barra. */
function bandsOf({ black, cyan, magenta, yellow }: Props): Array<{ key: string; pct: number | null; hex: string }> {
  return [
    { key: 'K', pct: black, hex: TONER_HEX.black },
    { key: 'C', pct: cyan, hex: TONER_HEX.cyan },
    { key: 'M', pct: magenta, hex: TONER_HEX.magenta },
    { key: 'Y', pct: yellow, hex: TONER_HEX.yellow },
  ];
}

export default function TonerLevelBars(props: Props) {
  const { black, cyan, magenta, yellow } = props;
  if (cyan === null && magenta === null && yellow === null) return <SupplyLevelBar pct={black} />;

  const min = Math.min(...[black, cyan, magenta, yellow].filter((v): v is number => v !== null));
  const bars = bandsOf(props);

  return (
    <div className="flex items-center gap-2.5" title={`Negro ${black ?? '—'}% · Cian ${cyan ?? '—'}% · Magenta ${magenta ?? '—'}% · Amarillo ${yellow ?? '—'}%`}>
      <div className="grid flex-1 grid-cols-4 gap-[3px]">
        {bars.map((b) => (
          <span key={b.key} className="block h-1.5 overflow-hidden rounded-[2px] bg-surface-track">
            {b.pct !== null && <span className="block h-full rounded-[2px]" style={{ width: `${Math.max(6, b.pct)}%`, background: b.hex }} />}
          </span>
        ))}
      </div>
      <span className="min-w-[30px] text-right font-montserrat text-[11.5px] font-semibold tabular-nums text-ink-100">{Number.isFinite(min) ? `${min}%` : '—'}</span>
    </div>
  );
}
