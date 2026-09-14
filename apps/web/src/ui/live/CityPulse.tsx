import type { AppConfig } from "../../chain/config";
import { liveEnabled } from "../../live/client";
import { useCityPulse, useNow } from "../../live/hooks";
import { big, num, timeAgo } from "../../live/model";
import { Kicker } from "../primitives";
import { FeedRow, mon } from "./Feed";
import { LiveChip } from "./LiveChip";

/**
 * The landing's pulse: the whole city's numbers and the last few things that happened, straight from the
 * indexer. Hidden when the deployment has no indexer — the landing is not the place for an "unavailable" note.
 */
export function CityPulse({ config }: { config: AppConfig | undefined }) {
  const addresses = config?.events.map((e) => e.address) ?? [];
  const pulse = useCityPulse(config?.chainId, addresses);
  const now = useNow();
  if (!liveEnabled || !config) return null;
  if (pulse.isError) {
    return (
      <div
        className="glass flex items-center justify-between gap-2 rounded-2xl px-4 py-2"
        data-testid="city-pulse"
      >
        <span className="text-xs text-muted">City pulse</span>
        <LiveChip chainId={config.chainId} />
      </div>
    );
  }
  const stats = pulse.data?.Stats[0];
  if (!stats) return null; // still loading, or a chain the indexer has not seen: nothing to claim yet
  const lastAt = num(stats.lastActivityAt);
  return (
    <div className="glass rounded-2xl px-4 py-3" data-testid="city-pulse">
      <div className="flex items-center justify-between gap-2">
        <Kicker>City pulse</Kicker>
        <LiveChip chainId={config.chainId} />
      </div>
      <div className="mono mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        <span>
          <span className="text-green">{stats.checkedIn}</span> inside
        </span>
        <span>
          <span className="text-amber">{stats.sold}</span> seats taken
        </span>
        <span>
          <span className="text-cyan">{stats.resales}</span> resales
        </span>
        <span>{stats.fans} passkeys</span>
        <span className="text-muted">{mon(big(stats.primaryVolume) + big(stats.resaleVolume))} moved</span>
      </div>
      {pulse.data && pulse.data.Activity.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1" data-testid="city-pulse-feed">
          {pulse.data.Activity.slice(0, 3).map((row) => (
            <FeedRow key={row.id} row={row} config={config} now={now} showEvent />
          ))}
        </ul>
      ) : null}
      {lastAt > 0 ? (
        <div className="mono mt-1.5 text-[10px] text-muted">last activity {timeAgo(lastAt, now)}</div>
      ) : null}
    </div>
  );
}
