import { AdaptiveDpr, PerformanceMonitor, Preload } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, SMAA, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Suspense, useMemo } from "react";
import { type AppConfig, findEvent } from "../chain/config";
import type { SeatMap } from "../chain/seats";
import { buildLayout } from "../venues/layout";
import { CameraRig } from "./CameraRig";
import { City } from "./City";
import { useDirector } from "./director";
import { Venue } from "./Venue";

interface WorldProps {
  config: AppConfig | undefined;
  seatMap: SeatMap | undefined;
  onEnterEvent: (address: string) => void;
}

/** The one canvas that lives under every route. */
export function World({ config, seatMap, onEnterEvent }: WorldProps) {
  const chapter = useDirector((s) => s.chapter);
  const eventAddress = useDirector((s) => s.eventAddress);
  const hoveredBeacon = useDirector((s) => s.hoveredBeacon);
  const quality = useDirector((s) => s.quality);
  const setQuality = useDirector((s) => s.setQuality);
  const event = findEvent(config, eventAddress ?? undefined);
  const layout = useMemo(() => (event ? buildLayout(event) : null), [event]);
  const events = config?.events ?? [];
  const focusBeacon = hoveredBeacon ? events.findIndex((e) => e.address === hoveredBeacon) : -1;
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="world" aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: false, stencil: false }}
        camera={{ fov: 42, near: 0.1, far: 1400, position: [0, 78, 236] }}
        frameloop={reduced ? "demand" : "always"}
        onCreated={(state) => {
          state.gl.setClearColor("#05060a", 1);
          // dev-only handle for headless probes (scripts/shoot.mjs --print)
          if (import.meta.env.DEV) {
            // Dev probes for scripts/shoot.mjs: the R3F root state and the director store.
            const w = window as unknown as { __world?: unknown; __director?: unknown };
            w.__world = state;
            w.__director = useDirector;
          }
        }}
      >
        <color attach="background" args={["#05060a"]} />
        {chapter === "city" || !layout ? (
          <fogExp2 attach="fog" args={["#141a2c", 0.0021]} />
        ) : (
          <fogExp2 attach="fog" args={["#05060a", layout.kind === "theatre" ? 0.014 : 0.018]} />
        )}
        <PerformanceMonitor
          onDecline={() => setQuality("low")}
          onIncline={() => setQuality("high")}
          flipflops={2}
          onFallback={() => setQuality("low")}
        />
        <AdaptiveDpr pixelated={false} />
        <Suspense fallback={null}>
          {chapter === "city" || !layout ? (
            <City events={events} onEnter={(e) => onEnterEvent(e.address)} />
          ) : (
            <Venue layout={layout} seatMap={seatMap} interactive={chapter === "venue"} />
          )}
          <CameraRig layout={layout} focusBeacon={focusBeacon >= 0 ? focusBeacon : null} />
          <Preload all />
        </Suspense>
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom
            intensity={quality === "high" ? 0.9 : 0.6}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.25}
            mipmapBlur
            radius={0.7}
          />
          <Vignette eskil={false} offset={0.2} darkness={0.7} />
          <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.26} />
          <SMAA />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
