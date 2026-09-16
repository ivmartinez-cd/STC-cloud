import type { DashboardData } from '../../../shared/types/monitor';
import SectionHead from './SectionHead';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import { fmt } from '../../../shared/lib/formatters';

function dotColor(isCurrent: boolean, version: string): string {
  if (isCurrent) return 'var(--color-brand)';
  if (version.toLowerCase() === 'desconocida') return 'var(--color-brand-severe)';
  return 'var(--color-ink-500)';
}

/** Una fila por versión Y canal: el parque corre `stable` y `legacy` a la vez,
 *  con runtimes distintos, y cada canal se actualiza contra su propio release.
 *  Juntarlos escondía que un canal se quedó atrás. */
function VersionRow({ version, channel, count, isCurrent }: { version: string; channel: string; count: number; isCurrent: boolean }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line-200 py-3">
      <span className="block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: dotColor(isCurrent, version) }} />
      <span className="font-mono text-[13px] text-ink-900">{version}</span>
      <span className="truncate font-sans text-[11px] uppercase tracking-[.06em] text-ink-400">{channel}{isCurrent ? ' · publicada' : ''}</span>
      <span className="ml-auto shrink-0 font-mono text-[13px] tabular-nums text-ink-900">{fmt(count)}</span>
    </div>
  );
}

/** "Agentes" del rediseño minimalista (handoff "Panel de control",
 * 16/09/2026): lista versión · canal → cantidad, con el total de monitores en
 * la cabecera y los agentes en versión desconocida como nota de pie (sólo
 * cuando los hay). El backend ya usa el literal `'desconocida'` para agentes
 * sin `version` (`dashboard-queries.ts`). */
export default function AgentsSection({
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
  const published = publishedAgentVersions ?? (currentAgentVersion ? { stable: currentAgentVersion } : {});

  return (
    <section>
      <SectionHead
        title="Agentes"
        right={!loading && !error && rows.length > 0 ? <span className="font-sans text-[12px] text-ink-400">{fmt(total)} monitores</span> : undefined}
      />
      {error ? (
        <CardError onRetry={onRetry} />
      ) : loading ? (
        Array.from({ length: 2 }, (_, i) => <SkeletonBlock key={i} heightPx={13} widthPct={70 - i * 15} className="my-3.5" />)
      ) : rows.length === 0 ? (
        <CardEmpty />
      ) : (
        <>
          {rows.map((v) => (
            <VersionRow key={`${v.version}·${v.channel}`} version={v.version} channel={v.channel} count={v.count} isCurrent={published[v.channel] === v.version} />
          ))}
          <div className="mt-2.5 font-sans text-[12px] text-ink-400">
            {unknown > 0 ? <><span className="text-brand-severe">{fmt(unknown)}</span> en versión desconocida</> : 'Sin agentes en versión desconocida'}
          </div>
        </>
      )}
    </section>
  );
}
