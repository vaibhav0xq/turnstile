import { type AppConfig, explorerTx } from "../../chain/config";
import { formatMon } from "../../lib/format";
import { type ActivityRow, big, describeActivity, kindTone, num, timeAgo } from "../../live/model";
import { Dot } from "../primitives";

/** Wei as MON for totals: `formatMon` says "Free" for zero, which is right for prices and wrong for volumes. */
export function mon(wei: bigint): string {
  return wei === 0n ? "0 MON" : formatMon(wei);
}

/** One activity line, shared by the organiser board, the passport history and the ticket timeline. */
export function FeedRow({
  row,
  config,
  viewer,
  now,
  showEvent = false,
}: {
  row: ActivityRow;
  config: AppConfig;
  viewer?: string | null;
  now: number;
  showEvent?: boolean;
}) {
  const amount = big(row.amount);
  const tx = explorerTx(config, row.txHash);
  const when = timeAgo(num(row.timestamp), now);
  return (
    <li className="flex items-start gap-2 text-xs" data-kind={row.kind}>
      <span className="mt-1">
        <Dot tone={kindTone(row.kind)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate">
          {describeActivity(row, viewer)}
          {amount > 0n ? <span className="text-muted"> · {formatMon(amount)}</span> : null}
        </div>
        <div className="mono text-[10px] text-muted">
          {showEvent && row.event ? `${row.event.name} · ` : ""}
          {tx ? (
            <a href={tx} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {when}
            </a>
          ) : (
            when
          )}
        </div>
      </div>
    </li>
  );
}
