import { useState } from "react";
import type { AppConfig } from "../../chain/config";
import { liveEnabled } from "../../live/client";
import { useNow, usePassportHistory } from "../../live/hooks";
import { num } from "../../live/model";
import { Kicker, Spinner, Stat } from "../primitives";
import { FeedRow } from "./Feed";
import { LiveChip, LiveFail, LiveOff } from "./LiveChip";

const FIRST_PAGE = 8;

/**
 * The public half of the passport: what this passkey's account has done on chain, from the indexer. The
 * private half (names, notes) never leaves the vault — this block is exactly what anyone could see.
 */
export function PassportHistory({
  config,
  address,
}: {
  config: AppConfig | undefined;
  address: string | null;
}) {
  return (
    <div className="mt-4 rounded-xl border border-line p-3" data-testid="passport-history">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Kicker>Attendance record</Kicker>
          <div className="mono mt-0.5 text-[11px] text-muted">
            public · read from the indexer, not the vault
          </div>
        </div>
        <LiveChip chainId={config?.chainId} />
      </div>
      <div className="mt-2">
        {!liveEnabled ? (
          <LiveOff what="History" />
        ) : !address ? (
          <div className="text-sm text-muted">Sign in to see what this passkey has done on chain.</div>
        ) : config ? (
          <HistoryBody config={config} address={address} />
        ) : (
          <Spinner />
        )}
      </div>
    </div>
  );
}

function HistoryBody({ config, address }: { config: AppConfig; address: string }) {
  const history = usePassportHistory(config.chainId, address);
  const now = useNow();
  const [all, setAll] = useState(false);
  if (history.isPending) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <Spinner /> Reading the indexer…
      </div>
    );
  }
  if (history.isError) return <LiveFail error={history.error} retry={() => void history.refetch()} />;
  const fan = history.data.Fan[0];
  const rows = history.data.Activity;
  if (!fan) {
    return (
      <div className="text-sm text-muted" data-testid="passport-history-empty">
        No on-chain history for this passkey yet.
      </div>
    );
  }
  const shown = all ? rows : rows.slice(0, FIRST_PAGE);
  return (
    <>
      <div className="mt-1 grid grid-cols-3 gap-3">
        <Stat label="Nights in" value={fan.checkIns} tone="green" />
        <Stat label="Seats taken" value={fan.bought} tone="amber" />
        <Stat label="Holding" value={fan.tickets} />
      </div>
      <div className="mono mt-2 text-[10px] text-muted">
        first seen {new Date(num(fan.firstSeenAt) * 1000).toLocaleDateString()} · last active{" "}
        {new Date(num(fan.lastSeenAt) * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5" data-testid="passport-history-feed">
        {shown.map((row) => (
          <FeedRow key={row.id} row={row} config={config} viewer={address} now={now} showEvent />
        ))}
      </ul>
      {rows.length > FIRST_PAGE ? (
        <button type="button" className="chip mono mt-2 hover:bg-ink-2" onClick={() => setAll((v) => !v)}>
          {all ? "Fewer" : `All ${rows.length}`}
        </button>
      ) : null}
    </>
  );
}
