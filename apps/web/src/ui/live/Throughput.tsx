import type { MinuteBucket } from "../../live/model";

/**
 * One-minute bars: seats taken (amber) under resales (cyan) under walk-ins (green). Pure CSS heights, no
 * chart library. Shared by the organiser's board (one night) and the pulse page (the whole chain).
 */
export function Throughput({ series, title }: { series: MinuteBucket[]; title: string }) {
  const peak = Math.max(1, ...series.map((b) => b.mints + b.checkIns + b.resales));
  const total = series.reduce(
    (acc, b) => ({
      mints: acc.mints + b.mints,
      checkIns: acc.checkIns + b.checkIns,
      resales: acc.resales + b.resales,
    }),
    { mints: 0, checkIns: 0, resales: 0 },
  );
  return (
    <div data-testid="throughput">
      <div className="flex items-center justify-between">
        <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted">{title}</div>
        <div className="mono text-[10px] text-muted">
          {total.mints + total.checkIns + total.resales === 0 ? (
            "quiet"
          ) : (
            <>
              <span className="text-amber">{total.mints} taken</span> ·{" "}
              <span className="text-green">{total.checkIns} in</span>
              {total.resales > 0 ? (
                <>
                  {" · "}
                  <span className="text-cyan">{total.resales} resold</span>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div
        className="mt-1.5 flex h-10 items-end gap-px"
        role="img"
        aria-label="Seats taken, resales and walk-ins per minute"
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
