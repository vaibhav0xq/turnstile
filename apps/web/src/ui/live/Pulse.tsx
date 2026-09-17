import { useState } from "react";
import { Link } from "react-router";
import { type AppConfig, explorerTx, findEvent } from "../../chain/config";
import { formatDate, formatMon, shortAddress } from "../../lib/format";
import { LIVE_URL, liveEnabled } from "../../live/client";
import { PULSE_MINUTES, useNow, usePulse } from "../../live/hooks";
import { big, minuteSeries, num, timeAgo } from "../../live/model";
import { type HandoverRow, PULSE, type PulseEventRow } from "../../live/queries";
import { Kicker, Spinner, Stat } from "../primitives";
import { REPO_URL } from "../site/copy";
import { FeedRow, mon } from "./Feed";
import { LiveChip, LiveFail, LiveOff } from "./LiveChip";
import { Throughput } from "./Throughput";

const INDEXER_URL = `${REPO_URL}/tree/main/packages/indexer`;

/**
 * The public pulse: everything the indexer knows about the chain, on one page, from one GraphQL query.
 * Nothing here is read over RPC. The query text is shown at the bottom so anyone can run it themselves.
 */
export function Pulse({ config }: { config: AppConfig | undefined }) {
  const pulse = usePulse(config?.chainId);
  const now = useNow();
  if (!liveEnabled) return <LiveOff what="Pulse" />;
  if (!config || pulse.isPending) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <Spinner /> Reading the indexer…
      </div>
    );
  }
  if (pulse.isError) return <LiveFail error={pulse.error} retry={() => void pulse.refetch()} />;
  const stats = pulse.data.Stats[0];
  if (!stats) {
    return (
      <div className="text-xs text-muted" data-testid="pulse-empty">
        The indexer has not seen this chain yet.
      </div>
    );
  }
  const series = minuteSeries(pulse.data.EventMinute, now, PULSE_MINUTES);
  const lastAt = num(stats.lastActivityAt);
  return (
    <div className="flex flex-col gap-6" data-testid="pulse">
      <section>
        <div className="flex items-center justify-between gap-2">
          <Kicker>Totals</Kicker>
          <LiveChip chainId={config.chainId} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4">
          <Stat label="Nights" value={stats.events} />
          <Stat
            label="Seats taken"
            value={stats.comps ? `${stats.sold} · ${stats.comps} comp` : stats.sold}
          />
          <Stat label="Inside" value={stats.checkedIn} tone="green" />
          <Stat label="Resales" value={stats.resales} tone="cyan" />
          <Stat label="Passkeys" value={stats.fans} />
          <Stat label="Box office" value={mon(big(stats.primaryVolume))} />
          <Stat label="Resale market" value={mon(big(stats.resaleVolume))} />
          <Stat label="Last activity" value={lastAt > 0 ? timeAgo(lastAt, now) : "none yet"} />
        </div>
      </section>

      <Throughput series={series} title={`Last ${PULSE_MINUTES} minutes`} />

      <section>
        <Kicker>Nights</Kicker>
        {pulse.data.Event.length === 0 ? (
          <div className="mt-1 text-xs text-muted">No nights indexed yet.</div>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1.5" data-testid="pulse-nights">
            {pulse.data.Event.map((row) => (
              <NightRow key={row.id} row={row} config={config} />
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <Kicker>Latest activity</Kicker>
          {pulse.data.feed.length === 0 ? (
            <div className="mt-1 text-xs text-muted">Nothing yet.</div>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1.5" data-testid="pulse-feed">
              {pulse.data.feed.map((row) => (
                <FeedRow key={row.id} row={row} config={config} now={now} showEvent />
              ))}
            </ul>
          )}
        </section>
        <div className="flex flex-col gap-6">
          <section>
            <Kicker>Doors</Kicker>
            {pulse.data.doors.length === 0 ? (
              <div className="mt-1 text-xs text-muted">No check-ins yet.</div>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1.5" data-testid="pulse-doors">
                {pulse.data.doors.map((row) => (
                  <FeedRow key={row.id} row={row} config={config} now={now} showEvent />
                ))}
              </ul>
            )}
          </section>
          <section>
            <Kicker>Handovers</Kicker>
            {pulse.data.Handover.length === 0 ? (
              <div className="mt-1 text-xs text-muted">No resales yet.</div>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1.5" data-testid="pulse-handovers">
                {pulse.data.Handover.map((row) => (
                  <HandoverLine key={row.id} row={row} config={config} now={now} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Source />
    </div>
  );
}

function NightRow({ row, config }: { row: PulseEventRow; config: AppConfig }) {
  const known = findEvent(config, row.address);
  const body = (
    <>
      <div className="min-w-0">
        <div className="truncate text-sm">{row.name}</div>
        <div className="mono text-[10px] text-muted">
          {formatDate(num(row.startsAt))} · {shortAddress(row.address)}
        </div>
      </div>
      <div className="mono shrink-0 text-right text-[11px]">
        <div>
          <span className="text-green">{row.checkedIn}</span> inside · {row.sold} taken
        </div>
        <div className="text-muted">
          {row.listed} listed · {row.resales} resold
        </div>
      </div>
    </>
  );
  const className = "flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2";
  return (
    <li>
      {known ? (
        <Link to={`/e/${row.address}`} className={`${className} hover:bg-ink-2`}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

function HandoverLine({ row, config, now }: { row: HandoverRow; config: AppConfig; now: number }) {
  const tx = explorerTx(config, row.txHash);
  const price = big(row.price);
  const fee = big(row.fee);
  return (
    <li className="text-xs" data-testid="pulse-handover">
      <div className="truncate">
        {shortAddress(row.seller)} → {shortAddress(row.buyer)} · {price > 0n ? formatMon(price) : "free"}
        {fee > 0n ? <span className="text-muted"> · fee {formatMon(fee)}</span> : null}
      </div>
      <div className="mono text-[10px] text-muted">
        {row.event.name} · seat {String(row.ticket.tokenId)} ·{" "}
        {tx ? (
          <a href={tx} className="link" target="_blank" rel="noreferrer">
            {timeAgo(num(row.timestamp), now)} →
          </a>
        ) : (
          timeAgo(num(row.timestamp), now)
        )}
      </div>
    </li>
  );
}

/** Where the rows come from, with the query itself, so the page can be reproduced against the endpoint. */
function Source() {
  const [copied, setCopied] = useState(false);
  return (
    <section className="rounded-xl border border-line p-3" data-testid="pulse-source">
      <Kicker>Powered by Envio HyperIndex</Kicker>
      <p className="mt-1 text-xs text-muted">
        The indexer follows the contracts on Monad and keeps the rows behind this page, the door boards, seat
        provenance and passport history. The freshness chip compares its last processed block with the block
        the relayer sees. The page polls every 8 seconds.
      </p>
      <div className="mono mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {LIVE_URL ? (
          <a href={LIVE_URL} className="link" target="_blank" rel="noreferrer">
            GraphQL endpoint →
          </a>
        ) : null}
        <a href={INDEXER_URL} className="link" target="_blank" rel="noreferrer">
          Indexer source →
        </a>
      </div>
      <details className="group mt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-xs">
          <span>The query behind this page</span>
          <span className="mono text-muted transition-transform group-open:rotate-45" aria-hidden>
            +
          </span>
        </summary>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="chip mono hover:bg-ink-2"
            onClick={() => {
              void navigator.clipboard?.writeText(PULSE.trim()).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy query"}
          </button>
          <span className="text-[11px] text-muted">
            Variables: chainId (Int) and since (unix seconds). POST it to the endpoint as JSON.
          </span>
        </div>
        <pre className="mono mt-2 max-h-72 overflow-auto rounded-lg bg-ink-2 p-3 text-[10px] leading-relaxed text-paper/80">
          {PULSE.trim()}
        </pre>
      </details>
    </section>
  );
}
