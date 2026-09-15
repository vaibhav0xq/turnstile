import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { useDirector } from "./director";
import { usePerf } from "./perf";

interface CompileGateProps {
  /** A composer draws the scene into a render target: compile that variant of every program, not the screen one. */
  composer: boolean;
  /** Changes when objects join a warm scene (beacons arriving with the config): warm them without a hold. */
  soft: string;
}

/**
 * Links a chapter's shader programs behind the flash or the curtain instead of on its first visible frame.
 * Mounted after the scene content with a key per cut, so its layout effect runs once the chapter's objects
 * are in the graph: every program is issued at once, the scene is hidden while the driver links them (off
 * the main thread where KHR_parallel_shader_compile exists), and each link is then checked in short bursts
 * so a driver without the extension stalls under the overlay, never on a drawn frame. `markWarm` lifts
 * the overlay; the director does the same on its own after WARM_MAX_MS, and the gate shows the scene the
 * moment that happens, whatever state its compile is in.
 *
 * The variant matters: three keys a program on whether a render target is bound (tone mapping and output
 * colour space differ), and the composer renders the scene into one. On those tiers a 1×1 target is bound
 * while the programs are issued, so what links here is what the frame uses. drei's `Preload` did the
 * opposite — the screen variants, plus a cube-camera pass — and the first frame compiled everything again.
 */
export function CompileGate({ composer, soft }: CompileGateProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // Read at issue time, never a dependency: losing the composer mid-session (a step down to `min`) must
  // not hide a scene that is already on screen. Its screen variants were linked in the background below.
  const composerRef = useRef(composer);
  composerRef.current = composer;
  const first = useRef(true);

  useLayoutEffect(() => {
    let cancelled = false;
    const started = performance.now();
    const before = newestProgram(gl);
    const chapter = useDirector.getState().chapter;
    const withComposer = composerRef.current;
    const issued = issue(gl, scene, camera, withComposer);
    // Nothing is drawn until the programs are ready; the overlay is up, the clear colour is behind it.
    // (A scene the director already counts as warm has no overlay to hide behind: it stays on screen.)
    if (!useDirector.getState().warm) scene.visible = false;
    const reveal = () => {
      if (scene.visible) return;
      scene.visible = true;
      invalidate();
    };
    // The overlay lifts without us after WARM_MAX_MS: never leave an empty canvas under a lifted overlay.
    const unsubscribe = useDirector.subscribe((s) => {
      if (s.warm) reveal();
    });
    void issued
      .then(() => settle(gl, before, () => cancelled))
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        reveal();
        useDirector.getState().markWarm();
        const programs = newestProgram(gl) - before;
        const ms = Math.round(performance.now() - started);
        const parallel = gl.extensions.has("KHR_parallel_shader_compile");
        usePerf.getState().noteCompile({ chapter, programs, ms, parallel });
        console.info(
          `[turnstile] ${chapter}: ${programs} programs compiled in ${ms} ms (parallel ${parallel ? "yes" : "no"})`,
        );
        // Tiers only step down, and a session that loses the composer needs the screen variant of every
        // material on its next frame. Where the driver links off the main thread, issue those now, behind
        // the scene, so the step costs one program switch and no compile.
        if (withComposer && parallel) void issue(gl, scene, camera, false).catch(() => undefined);
      });
    return () => {
      cancelled = true;
      unsubscribe();
      scene.visible = true;
    };
  }, [gl, scene, camera, invalidate]);

  // Objects that arrive after the reveal (the beacons, when the config lands after the city): issue their
  // programs before the frame that would first draw them — in the background where the driver allows,
  // as a stall at commit time where it does not, which is what their first frame would have cost.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `soft` is the trigger, not an input
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!useDirector.getState().warm) return; // a gated compile is already in flight for this scene
    void issue(gl, scene, camera, composerRef.current).catch(() => undefined);
  }, [soft]);

  return null;
}

/** Highest program id the renderer has created so far: programs ever compiled, not the cache's current size. */
function newestProgram(gl: THREE.WebGLRenderer): number {
  let max = 0;
  for (const p of gl.info.programs ?? []) if (p.id > max) max = p.id;
  return max;
}

/** Issue every program of the scene, in the variant the frame will use; resolves when the driver has linked them. */
function issue(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  composer: boolean,
): Promise<unknown> {
  const target = composer ? new THREE.WebGLRenderTarget(1, 1) : null;
  const previous = gl.getRenderTarget();
  scene.visible = true; // `compile` gathers the lights from what is visible
  if (target) gl.setRenderTarget(target);
  try {
    return gl.compileAsync(scene, camera).finally(() => target?.dispose());
  } catch (error) {
    target?.dispose();
    return Promise.reject(error);
  } finally {
    gl.setRenderTarget(previous);
  }
}

/**
 * Query each new program's link result in bursts of ≤ 12 ms, yielding between them. Where the driver links
 * on the calling thread this is the wait itself — taken here, under the overlay, with input still served
 * between bursts; where it linked in parallel it only fills the uniform caches the first draw would.
 */
async function settle(gl: THREE.WebGLRenderer, since: number, cancelled: () => boolean): Promise<void> {
  const pending = (gl.info.programs ?? []).filter((p) => p.id > since);
  let burst = performance.now();
  for (const program of pending) {
    if (cancelled()) return;
    if (program.program === undefined) continue; // released while we waited
    program.getUniforms();
    if (performance.now() - burst > 12) {
      await new Promise((r) => setTimeout(r, 0));
      burst = performance.now();
    }
  }
}
