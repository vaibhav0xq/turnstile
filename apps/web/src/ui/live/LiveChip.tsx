import { liveEnabled } from "../../live/client";
import { useLiveFreshness } from "../../live/hooks";
import { freshness, lagAsTime } from "../../live/model";
import { Dot } from "../primitives";

/**
 * The freshness chip: how far the Envio indexer trails the chain the relayer sees, both heads read in the
 * same tick. Renders nothing when the deployment has no indexer; says "unavailable" (with the reason on
 * hover) rather than pretending.
 */
export function LiveChip({ chainId, className = "" }: { chainId: number | undefined; className?: string }) {
  const fresh = useLiveFreshness(chainId);
  if (!liveEnabled) return null;
  if (fresh.isError) {
    return (
      <span
        className={`chip mono shrink-0 whitespace-nowrap text-red ${className}`}
        title={fresh.error.message}
        data-testid="live-chip"
      >
        <Dot tone="red" /> Envio unavailable
      </span>
    );
  }
  const indexed = fresh.data?.indexed ?? null;
  const headBlock = fresh.data?.head ?? null;
  const state = freshness(indexed, headBlock);
  const title = [
    indexed === null ? null : `indexer at #${indexed}`,
    headBlock === null ? null : `relayer sees #${headBlock}`,
    state.lag
      ? `${state.lag} ${state.lag === 1 ? "block" : "blocks"} ${lagAsTime(state.lag)} · read together`
      : null,
    "indexed by Envio HyperIndex",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className={`chip mono shrink-0 whitespace-nowrap ${className}`}
      title={title}
      data-testid="live-chip"
      data-tone={state.tone}
    >
      <Dot tone={state.tone} /> {state.label}
    </span>
  );
}

/** The explicit "off" state for a surface that needs the indexer, so a missing URL never looks like no data. */
export function LiveOff({ what }: { what: string }) {
  return (
    <div className="text-xs text-muted" data-testid="live-off">
      {what} unavailable — this deployment has no indexer configured.
    </div>
  );
}

export function LiveFail({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-red" data-testid="live-fail">
      <span>{error.message} — nothing is shown rather than stale numbers.</span>
      <button type="button" className="chip mono hover:bg-ink-2" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
