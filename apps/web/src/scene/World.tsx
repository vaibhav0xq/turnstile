import { AdaptiveDpr, PerformanceMonitor, Preload } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, SMAA, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Suspense, useEffect, useMemo } from "react";
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

/** Can this browser give us a context at all? Probed once, before the canvas is mounted. */
function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * The one canvas that lives under every route; a flat backdrop when the machine cannot draw it.
 * Loaded lazily by the app (this module pulls in the whole three stack) inside a WorldBoundary, which
 * also catches R3F throwing synchronously when a context cannot be created.
 */
export function World({ config, seatMap, onEnterEvent }: WorldProps) {
  const flat = useDirector((s) => s.flat);
  const goFlat = useDirector((s) => s.goFlat);
  const canDraw = useMemo(() => webglAvailable(), []);
  useEffect(() => {
    if (!canDraw) goFlat();
  }, [canDraw, goFlat]);
  if (flat || !canDraw) return <div className="world world-flat" aria-hidden />;
  return <Scene config={config} seatMap={seatMap} onEnterEvent={onEnterEvent} />;
}

export default World;

function Scene({ config, seatMap, onEnterEvent }: WorldProps) {
  const chapter = useDirector((s) => s.chapter);
  const eventAddress = useDirector((s) => s.eventAddress);
  const hoveredBeacon = useDirector((s) => s.hoveredBeacon);
  const transition = useDirector((s) => s.transition);
  const quality = useDirector((s) => s.quality);
  const setQuality = useDirector((s) => s.setQuality);
  const event = findEvent(config, eventAddress ?? undefined);
  const layout = useMemo(() => (event ? buildLayout(event) : null), [event]);
  const events = config?.events ?? [];
  const focusBeacon = hoveredBeacon ? events.findIndex((e) => e.address === hoveredBeacon) : -1;
  const diveBeacon =
    transition?.kind === "dive"
      ? events.findIndex((e) => e.address.toLowerCase() === transition.eventAddress.toLowerCase())
      : -1;
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="world" aria-hidden>
      <Canvas
        dpr={quality === "high" ? [1, 1.75] : [1, 1.5]}
        gl={{
          antialias: false,
          powerPreference: "high-performance",
          alpha: false,
          stencil: false,
          failIfMajorPerformanceCaveat: false,
        }}
        camera={{ fov: 42, near: 0.1, far: 1400, position: [0, 78, 236] }}
        frameloop={reduced ? "demand" : "always"}
        onCreated={(state) => {
          state.gl.setClearColor("#05060a", 1);
          // A context lost for good (GPU reset, tab throttling on a phone) drops to the flat product.
          state.gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            useDirector.getState().goFlat();
          });
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
        {/* Tiers only ever step down: the first frames after stepping up compile new pipeline state and
            can hold a black frame for seconds on a weak GPU, which is worse than staying at low. */}
        <PerformanceMonitor
          onDecline={() => setQuality(quality === "high" ? "low" : "min")}
          flipflops={2}
          onFallback={() => setQuality("min")}
        />
        <AdaptiveDpr pixelated={false} />
        <FirstFrame />
        <Suspense fallback={null}>
          {chapter === "city" || !layout ? (
            <City events={events} onEnter={(e) => onEnterEvent(e.address)} />
          ) : (
            <Venue layout={layout} seatMap={seatMap} interactive={chapter === "venue"} />
          )}
          <CameraRig
            layout={layout}
            focusBeacon={focusBeacon >= 0 ? focusBeacon : null}
            diveBeacon={diveBeacon >= 0 ? diveBeacon : null}
          />
          {/* Re-run on every cut so a venue's programs link behind the curtain, not on its first frame. */}
          <Preload all key={`${chapter}:${eventAddress ?? ""}`} />
        </Suspense>
        {quality === "min" ? null : (
          <EffectComposer multisampling={0} enableNormalPass={false}>
            <Bloom
              intensity={quality === "high" ? 0.9 : 0.6}
              luminanceThreshold={0.55}
              luminanceSmoothing={0.25}
              mipmapBlur
              radius={0.7}
            />
            <Vignette eskil={false} offset={0.2} darkness={0.7} />
            {/* Kept mounted at every tier: adding/removing a composer child mid-session drops the render
                pass and the frame goes black, so the grain is turned down rather than taken out. */}
            <Noise
              premultiply
              blendFunction={BlendFunction.SOFT_LIGHT}
              opacity={quality === "high" ? 0.26 : 0}
            />
            <SMAA />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}

/** Flags the director once the first frame is on screen: shaders compiled, the veil can lift. */
function FirstFrame() {
  useFrame(() => {
    useDirector.getState().markReady();
  });
  return null;
}
