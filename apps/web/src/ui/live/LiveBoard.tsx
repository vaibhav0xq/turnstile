import type { AppConfig, EventInfo } from "../../chain/config";
import { liveEnabled } from "../../live/client";
import { useNow, useOrganiserBoard } from "../../live/hooks";
import { big, type MinuteBucket, minuteSeries } from "../../live/model";
import { Kicker, Spinner, Stat } from "../primitives";
import { FeedRow, mon } from "./Feed";
import { LiveChip, LiveFail, LiveOff } from "./LiveChip";

/**
 * The organiser's live board for one night: what the door and the box office are doing right now, from the
 * indexer rather than from seat-map RPC reads. Everything on it is a projection of chain events.
 */
export function LiveBoard({ config, event }: { config: AppConfig; event: EventInfo }) {
  const board = useOrganiserBoard(config.chainId, event.address);
  const now = useNow();
  if (!liveEnabled) return <LiveOff what="Live board" />;
  if (board.isPending) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <Spinner /> Reading the indexer…
      </div>
    );
  }
  if (board.isError) return <LiveFail error={board.error} retry={() => void board.refetch()} />;
  const row = board.data.Event[0];
  if (!row) {
    return (
      <div className="text-xs text-muted" data-testid="live-board-empty">
        The indexer has not seen this event yet. It appears after publishing.
      </div>
    );
  }
  const series = minuteSeries(board.data.EventMinute, now);
  return (
    <div className="flex flex-col gap-3" data-testid="live-board">
      <div className="flex items-center justify-between gap-2">
        <Kicker>Live board</Kicker>
        <LiveChip chainId={config.chainId} />
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4">
        <Stat label="Inside" value={row.checkedIn} tone="green" />
        <Stat label="Taken" value={row.comps ? `${row.sold} · ${row.comps} comp` : row.sold} />
        <Stat label="Listed" value={row.listed} tone="cyan" />
        <Stat label="Resales" value={row.resales} />
        <Stat label="Box office" value={mon(big(row.primaryVolume))} />
        <Stat label="Resale market" value={mon(big(row.resaleVolume))} />
        <Stat label="Your resale fees" value={mon(big(row.resaleFees))} tone="amber" />
      </div>
      <Throughput series={series} />
      <div>
        <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted">Door feed</div>
        {board.data.Activity.length === 0 ? (
          <div className="mt-1 text-xs text-muted">No activity yet.</div>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1.5" data-testid="live-board-feed">
            {board.data.Activity.map((a) => (
              <FeedRow key={a.id} row={a} config={config} now={now} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Thirty one-minute bars: seats taken (amber) under walk-ins (green). Pure CSS heights, no chart library. */
function Throughput({ series }: { series: MinuteBucket[] }) {
  const peak = Math.max(1, ...series.map((b) => b.mints + b.checkIns + b.resales));
  const total = series.reduce(
    (acc, b) => ({ mints: acc.mints + b.mints, checkIns: acc.checkIns + b.checkIns }),
    { mints: 0, checkIns: 0 },
  );
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted">Last 30 minutes</div>
        <div className="mono text-[10px] text-muted">
          <span className="text-amber">{total.mints} taken</span> ·{" "}
          <span className="text-green">{total.checkIns} in</span>
        </div>
      </div>
      <div
        className="mt-1.5 flex h-10 items-end gap-px"
        role="img"
        aria-label="Seats taken and walk-ins per minute"
      >
        {series.map((b) => {
          const h = (n: number) => `${Math.round((n / peak) * 100)}%`;
          return (
            <div key={b.minute} className="flex flex-1 flex-col justify-end" style={{ height: "100%" }}>
              <div className="w-full bg-green/80" style={{ height: h(b.checkIns) }} />
              <div className="w-full bg-cyan/70" style={{ height: h(b.resales) }} />
              <div className="w-full bg-amber/80" style={{ height: h(b.mints) }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
