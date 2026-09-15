import { useState } from "react";
import type { AppConfig, EventInfo } from "../../chain/config";
import { liveEnabled } from "../../live/client";
import { useNow, useTicketProvenance } from "../../live/hooks";
import { summariseProvenance, timeAgo } from "../../live/model";
import { Spinner } from "../primitives";
import { FeedRow } from "./Feed";
import { LiveChip, LiveFail, LiveOff } from "./LiveChip";

/**
 * A seat's public history: minted, bound, listed, handed over, walked in — oldest first, every line a
 * transaction. Anyone can read it; only the holder's passkey can produce an entry code.
 */
export function Provenance({
  config,
  event,
  tokenId,
  viewer,
}: {
  config: AppConfig;
  event: EventInfo;
  tokenId: number;
  viewer: string | null;
}) {
  const provenance = useTicketProvenance(config.chainId, event.address, tokenId);
  const now = useNow();
  const [open, setOpen] = useState(false);
  if (!liveEnabled) {
    return (
      <div className="border-line border-t px-5 py-3">
        <LiveOff what="Provenance" />
      </div>
    );
  }
  return (
    <div className="border-line border-t px-5 py-3" data-testid="provenance">
      {provenance.isPending ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Spinner /> Reading the seat's history…
        </div>
      ) : provenance.isError ? (
        <LiveFail error={provenance.error} retry={() => void provenance.refetch()} />
      ) : (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted">Seat history</div>
            <LiveChip chainId={config.chainId} />
          </div>
          {provenance.data.Activity.length === 0 ? (
            <div className="text-xs text-muted" data-testid="provenance-empty">
              No history for this seat yet.
            </div>
          ) : (
            <>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                data-testid="provenance-toggle"
              >
                <span className="mono text-[11px] text-muted">{summary(provenance.data.Activity, now)}</span>
                <span className="mono shrink-0 whitespace-nowrap text-[11px] text-muted">
                  {open ? "hide" : "history"} ↕
                </span>
              </button>
              {open ? (
                <ul className="mt-2 flex flex-col gap-1.5" data-testid="provenance-feed">
                  {provenance.data.Activity.map((row) => (
                    <FeedRow key={row.id} row={row} config={config} viewer={viewer} now={now} />
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

function summary(rows: Parameters<typeof summariseProvenance>[0], now: number): string {
  const s = summariseProvenance(rows);
  const parts: string[] = [];
  if (s.minted !== null) parts.push(`taken ${timeAgo(s.minted, now)}`);
  parts.push(
    s.handovers === 0
      ? "never changed hands"
      : `changed hands ${s.handovers === 1 ? "once" : `${s.handovers}×`}`,
  );
  if (s.checkedIn !== null) parts.push(`walked in ${timeAgo(s.checkedIn, now)}`);
  return `${rows.length} on-chain ${rows.length === 1 ? "entry" : "entries"} · ${parts.join(" · ")}`;
}
