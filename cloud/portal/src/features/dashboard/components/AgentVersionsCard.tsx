import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import { fmt } from '../../../shared/lib/formatters';

function dotColor(isCurrent: boolean, version: string): string {
  if (isCurrent) return 'var(--color-brand)';
  if (version.toLowerCase() === 'desconocida') return 'var(--color-brand-severe)';
  return 'var(--color-brand-gray)';
}

/** Una fila por versión Y canal: el parque corre `stable` y `legacy` a la vez,
 *  con runtimes distintos, y cada canal se actualiza contra su propio release.
 *  Juntarlos escondía que un canal se quedó atrás. */
const VersionRow = ({ version, channel, count, isCurrent }: { version: string; channel: string; count: number; isCurrent: boolean }) => (
  <div className="flex items-center justify-between border-b border-line-200 py-1.5">
    <span className="flex min-w-0 items-center gap-2 font-sans text-[12px] text-ink-700">
      <span className="block h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: dotColor(isCurrent, version) }} />
      <span className="truncate">{version}</span>
      <span className="shrink-0 font-mono text-[10.5px] text-ink-300">{channel}</span>
      {isCurrent && <span className="shrink-0 font-sans text-[11px] text-ink-400">· publicada</span>}
    </span>
    <span className="shrink-0 font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-900">{fmt(count)}</span>
  </div>
);

/** "Agentes" del rediseño "V1 Compacta" (handoff 14/09/2026): lista simple
 * versión → cantidad, sin la cifra grande de "monitores en versión
 * desconocida" que tenía antes (backend ya usa el literal `'desconocida'`
 * para agentes sin `version`, `dashboard-queries.ts`) — ese dato baja de
 * rango a una nota de pie, sólo cuando hay algún agente así. */
export default function AgentVersionsCard({
  agentVersions, currentAgentVersion, publishedAgentVersions, loading, error, onRetry,
}: {
  agentVersions: DashboardData['agentVersions'] | undefined;
  currentAgentVersion: DashboardData['currentAgentVersion'] | undefined;
  publishedAgentVersions: DashboardData['publishedAgentVersions'] | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = agentVersions ?? [];
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const unknown = rows.filter((r) => r.version.toLowerCase() === 'desconocida').reduce((a, r) => a + r.count, 0);
  // Fallback al canal stable: una API vieja no manda el mapa por canal.
  const publishedByChannel = publishedAgentVersions ?? (currentAgentVersion ? { stable: currentAgentVersion } : {});

  return (
    <SdsPanel
      title="Agentes"
      headerClassName="px-[18px] py-[14px]"
      headerRight={!loading && !error && rows.length > 0 ? <span className="font-sans text-[11px] text-ink-300">{fmt(total)} monitores</span> : undefined}
    >
      <div className="px-[18px] pb-4 pt-2">
        {error ? (
          <CardError onRetry={onRetry} />
        ) : loading ? (
          <>
            <SkeletonBlock heightPx={12} className="mb-2 mt-2" />
            <SkeletonBlock heightPx={12} widthPct={60} />
          </>
        ) : rows.length === 0 ? (
          <CardEmpty />
        ) : (
          <>
            {rows.map((v) => (
              <VersionRow
                key={`${v.version}·${v.channel}`} version={v.version} channel={v.channel} count={v.count}
                isCurrent={publishedByChannel[v.channel] === v.version}
              />
            ))}
            <div className="border-t border-line-150 pt-2.5 font-sans text-[11px] text-ink-300">
              {unknown > 0 ? (
                <><b className="font-semibold text-brand-severe">{fmt(unknown)}</b> en versión desconocida</>
              ) : 'Sin agentes en versión desconocida'}
            </div>
          </>
        )}
      </div>
    </SdsPanel>
  );
}
