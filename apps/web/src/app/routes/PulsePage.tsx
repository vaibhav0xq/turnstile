import { useEffect } from "react";
import { Link } from "react-router";
import { type AppConfig, chainName } from "../../chain/config";
import { useDirector } from "../../scene/director";
import { Pulse } from "../../ui/live/Pulse";
import { Kicker, Panel } from "../../ui/primitives";

/** `/pulse`: the public, read-only view of what the indexer sees. No passkey involved. */
export function PulsePage({ config }: { config: AppConfig | undefined }) {
  const showCity = useDirector((s) => s.showCity);
  useEffect(() => {
    showCity();
  }, [showCity]);
  return (
    <div className="overlay flex items-end justify-start p-4 pt-20 sm:items-start sm:justify-center sm:p-6 sm:pt-24">
      <Panel className="glass-solid fade-up scrollbar-none max-h-[calc(100dvh-6rem)] w-full max-w-2xl overflow-y-auto p-5 sm:max-h-[calc(100dvh-7.5rem)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Kicker>Pulse</Kicker>
            <div className="display mt-1 text-3xl">What the chain is doing</div>
            <div className="mono mt-1 text-xs text-muted">
              {config ? chainName(config.chainId) : "connecting…"} · indexed by Envio · public
            </div>
          </div>
          <Link
            to="/city"
            className="mono shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted hover:text-paper"
          >
            City →
          </Link>
        </div>
        <div className="mt-5">
          <Pulse config={config} />
        </div>
      </Panel>
    </div>
  );
}
