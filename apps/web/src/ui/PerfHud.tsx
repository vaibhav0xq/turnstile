import { useDirector } from "../scene/director";
import { usePerf } from "../scene/perf";

/**
 * `?perf=1`: a small readout over everything (the overlays included, so a held flash still shows the frame
 * time) for reading a device's numbers off a screenshot. Nothing here re-renders more than twice a second.
 */
export function PerfHud() {
  const enabled = usePerf((s) => s.enabled);
  const sample = usePerf((s) => s.sample);
  const compile = usePerf((s) => s.compile);
  const quality = useDirector((s) => s.quality);
  const flat = useDirector((s) => s.flat);
  if (!enabled) return null;
  return (
    <div className="perf-hud mono" aria-hidden data-testid="perf-hud">
      <div>
        {flat ? "flat" : quality}
        {sample ? ` · ${sample.width}×${sample.height} @${sample.dpr.toFixed(2)}` : ""}
      </div>
      {sample ? (
        <>
          <div>
            {sample.fps} fps · {sample.ms} ms · worst {sample.worst}
            {sample.long ? ` · ${sample.long} long` : ""}
          </div>
          <div>
            {sample.calls} calls · {formatCount(sample.triangles)} tris · {sample.programs} programs
          </div>
        </>
      ) : (
        <div>waiting for the first frame…</div>
      )}
      {compile ? (
        <div>
          {compile.chapter}: {compile.programs} programs in {compile.ms} ms · parallel{" "}
          {compile.parallel ? "yes" : "no"}
        </div>
      ) : null}
    </div>
  );
}

function formatCount(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}
