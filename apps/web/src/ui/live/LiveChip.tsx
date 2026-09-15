import { liveEnabled } from "../../live/client";
import { useChainHead, useIndexerSync } from "../../live/hooks";
import { big, freshness } from "../../live/model";
import { Dot } from "../primitives";

/**
 * The freshness chip: how far the Envio indexer trails the chain the relayer sees. Renders nothing when the
 * deployment has no indexer; says "unavailable" (with the reason on hover) rather than pretending.
 */
export function LiveChip({ chainId, className = "" }: { chainId: number | undefined; className?: string }) {
  const sync = useIndexerSync(chainId);
  const head = useChainHead();
  if (!liveEnabled) return null;
  if (sync.isError) {
    return (
      <span
        className={`chip mono shrink-0 whitespace-nowrap text-red ${className}`}
        title={sync.error.message}
        data-testid="live-chip"
      >
        <Dot tone="red" /> Envio unavailable
      </span>
    );
  }
  const row = sync.data?.chain_metadata[0];
  const indexed = row?.latest_processed_block == null ? null : big(row.latest_processed_block);
  const headBlock = head.data ? big(head.data.block) : null;
  const state = freshness(indexed, headBlock);
  const title = [
    indexed === null ? null : `indexer at #${indexed}`,
    headBlock === null ? null : `relayer sees #${headBlock}`,
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
