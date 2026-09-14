import { CameraControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { VenueLayout, Waypoint } from "../venues/layout";
import { seatFocus, seatViewpoint } from "../venues/layout";
import { beaconSlot } from "./City";
import { DESCENT_MS, DIVE_MS, type Transition, useDirector } from "./director";
import {
  CITY_POSE,
  damp,
  FLIGHT_DAMPING,
  FLIGHT_KEYS,
  type FlightKey,
  type FlightSample,
  flightPose,
  PORTRAIT_KEYS,
  sampleFlight,
  useFlight,
} from "./flight";

interface CameraRigProps {
  layout: VenueLayout | null;
  /** Index of the hovered/selected event in the city (for a gentle lean toward its beacon). */
  focusBeacon: number | null;
  /** Index of the event the camera is diving into, while a dive is running. */
  diveBeacon: number | null;
}

const CITY = { position: new THREE.Vector3(...CITY_POSE.p), target: new THREE.Vector3(...CITY_POSE.t) };
const DEFAULT_FOV = CITY_POSE.fov;

/**
 * Development only: `?pose=x,y,z,tx,ty,tz[,fov]` pins the camera for stills and framing work (the shoot
 * script and the video). Read once; the production bundle never looks.
 */
const STILL_POSE: FlightKey | null = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("pose");
  if (!raw) return null;
  const v = raw.split(",").map(Number);
  if (v.length < 6 || v.some((n) => !Number.isFinite(n))) return null;
  return {
    p: [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0],
    t: [v[3] ?? 0, v[4] ?? 0, v[5] ?? 0],
    fov: v[6] ?? DEFAULT_FOV,
  };
})();
/** Pointer parallax in the city: ±2° of yaw, ±1° of pitch, desktop only. */
const PARALLAX_YAW = THREE.MathUtils.degToRad(2);
const PARALLAX_PITCH = THREE.MathUtils.degToRad(1);

/** Start and end of a scripted camera move; the frame loop interpolates between them. */
interface Move {
  p0: THREE.Vector3;
  t0: THREE.Vector3;
  p1: THREE.Vector3;
  t1: THREE.Vector3;
}

const tmpP = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const flightSample: FlightSample = { position: [0, 0, 0], target: [0, 0, 0], fov: DEFAULT_FOV };

/** Orbit limits for the picker: close enough to read a beacon, never under the roofs or straight above. */
function cityLimits(c: CameraControls) {
  c.minDistance = 120;
  c.maxDistance = 360;
  c.minPolarAngle = 0.55;
  c.maxPolarAngle = 1.32;
}

function waypointFor(layout: VenueLayout, chapter: string): Waypoint {
  return chapter === "gate" ? layout.camera.entrance : layout.camera.overview;
}

export function CameraRig({ layout, focusBeacon, diveBeacon }: CameraRigProps) {
  const controls = useRef<CameraControls>(null);
  const chapter = useDirector((s) => s.chapter);
  const viewMode = useDirector((s) => s.viewMode);
  const viewSeat = useDirector((s) => s.viewSeat);
  const revealStartedAt = useDirector((s) => s.revealStartedAt);
  const transition = useDirector((s) => s.transition);
  const endTransition = useDirector((s) => s.endTransition);
  const drift = useRef(0);
  /** Field of view the current shot asks for; the frame loop eases the camera to it. */
  const fov = useRef(DEFAULT_FOV);
  const move = useRef<Move | null>(null);
  const dragging = useRef(false);
  const parallax = useRef({ yaw: 0, pitch: 0 });
  const flightActive = useFlight((s) => s.active);
  /** Where along the flight the camera is, in key units; eased toward the scroll's target every frame. */
  const flightU = useRef(0);
  /** The frame loop holds the camera for the flight (controls off, limits open) until it lands. */
  const flightOwned = useRef(false);
  /** The flight ended on the city: the camera finishes the path to the picker's pose before handing over. */
  const landing = useRef(false);
  /** When the city was last cut to; a flight taking over within a second of it starts where the scroll says. */
  const cityShownAt = useRef(0);
  const finePointer = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches,
    [],
  );

  // Chapter changes: place the camera without transition right after a cut, then ease into the waypoint.
  // A descent owns the camera instead (see below).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every cut (revealStartedAt)
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (useDirector.getState().transition?.kind === "descent") return;
    if (chapter === "city") {
      cityShownAt.current = performance.now();
      fov.current = DEFAULT_FOV;
      cityLimits(c);
      c.setLookAt(
        CITY.position.x,
        CITY.position.y + 40,
        CITY.position.z + 60,
        CITY.target.x,
        CITY.target.y,
        CITY.target.z,
        false,
      );
      void c.setLookAt(
        CITY.position.x,
        CITY.position.y,
        CITY.position.z,
        CITY.target.x,
        CITY.target.y,
        CITY.target.z,
        true,
      );
      return;
    }
    if (!layout) return;
    const wp = waypointFor(layout, chapter);
    fov.current = wp.fov ?? DEFAULT_FOV;
    c.minDistance = 2;
    c.maxDistance = layout.radius * 1.6;
    c.minPolarAngle = 0.25;
    c.maxPolarAngle = 1.5;
    c.setLookAt(
      wp.position.x,
      wp.position.y + 9,
      wp.position.z + 6,
      wp.target.x,
      wp.target.y,
      wp.target.z,
      false,
    );
    void c.setLookAt(
      wp.position.x,
      wp.position.y,
      wp.position.z,
      wp.target.x,
      wp.target.y,
      wp.target.z,
      true,
    );
  }, [chapter, layout, revealStartedAt]);

  // The dive → descent move. The dive leaves from wherever the camera is and ends low beside the beacon,
  // looking into the foot of the column; the descent starts high over the room and settles on the
  // chapter's waypoint. The user's input is off until the camera has landed. A layout effect, so the
  // camera is over the room before the first frame of it is drawn.
  const lastTransition = useRef<Transition | null>(null);
  useLayoutEffect(() => {
    const c = controls.current;
    if (!c) return;
    const previous = lastTransition.current;
    lastTransition.current = transition;
    if (!transition) {
      move.current = null;
      c.enabled = true;
      // a dive cancelled by navigation leaves the camera mid-air: ease it back to the chapter's shot
      if (previous?.kind === "dive") {
        const wp = chapter === "city" || !layout ? CITY : waypointFor(layout, chapter);
        fov.current =
          chapter === "city" || !layout ? DEFAULT_FOV : (waypointFor(layout, chapter).fov ?? DEFAULT_FOV);
        void c.setLookAt(
          wp.position.x,
          wp.position.y,
          wp.position.z,
          wp.target.x,
          wp.target.y,
          wp.target.z,
          true,
        );
      }
      return;
    }
    c.enabled = false;
    if (transition.kind === "dive") {
      const p0 = c.getPosition(new THREE.Vector3());
      const t0 = c.getTarget(new THREE.Vector3());
      const [bx, bz] = diveBeacon != null && diveBeacon >= 0 ? beaconSlot(diveBeacon) : [0, 0];
      const side = new THREE.Vector3(p0.x - bx, 0, p0.z - bz);
      if (side.lengthSq() < 1) side.set(0, 0, 1);
      side.normalize();
      move.current = {
        p0,
        t0,
        p1: new THREE.Vector3(bx + side.x * 7, 19, bz + side.z * 7),
        t1: new THREE.Vector3(bx, 3, bz),
      };
      fov.current = 30;
      return;
    }
    if (!layout) return;
    const wp = waypointFor(layout, chapter);
    const p1 = new THREE.Vector3(wp.position.x, wp.position.y, wp.position.z);
    const t1 = new THREE.Vector3(wp.target.x, wp.target.y, wp.target.z);
    const p0 = new THREE.Vector3(
      wp.position.x * 0.35,
      Math.max(wp.position.y + 11, 24),
      wp.position.z * 0.35,
    );
    const t0 = new THREE.Vector3(wp.target.x, wp.target.y - 0.8, wp.target.z);
    move.current = { p0, t0, p1, t1 };
    fov.current = wp.fov ?? DEFAULT_FOV;
    c.minDistance = 2;
    c.maxDistance = layout.radius * 1.6;
    c.minPolarAngle = 0.25;
    c.maxPolarAngle = 1.5;
    c.setLookAt(p0.x, p0.y, p0.z, t0.x, t0.y, t0.z, false);
  }, [transition, layout, chapter, diveBeacon]);

  // View from a seat ↔ overview.
  useEffect(() => {
    const c = controls.current;
    if (!c || !layout || chapter === "city") return;
    if ((viewMode === "seat" || viewMode === "focus") && viewSeat != null) {
      const seat = layout.byId.get(viewSeat);
      if (!seat) return;
      const wp = viewMode === "seat" ? seatViewpoint(layout, seat) : seatFocus(layout, seat);
      fov.current = DEFAULT_FOV;
      void c.setLookAt(
        wp.position.x,
        wp.position.y,
        wp.position.z,
        wp.target.x,
        wp.target.y,
        wp.target.z,
        true,
      );
    } else if (viewMode === "overview") {
      const wp = waypointFor(layout, chapter);
      fov.current = wp.fov ?? DEFAULT_FOV;
      void c.setLookAt(
        wp.position.x,
        wp.position.y,
        wp.position.z,
        wp.target.x,
        wp.target.y,
        wp.target.z,
        true,
      );
    }
  }, [viewMode, viewSeat, layout, chapter]);

  // Know when the user has hold of the camera, so the parallax does not fight the drag.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const start = () => {
      dragging.current = true;
    };
    const end = () => {
      dragging.current = false;
    };
    c.addEventListener("controlstart", start);
    c.addEventListener("controlend", end);
    return () => {
      c.removeEventListener("controlstart", start);
      c.removeEventListener("controlend", end);
    };
  }, []);

  // Idle drift: the city slowly orbits and leans with the pointer; the venue breathes. The lens eases
  // toward the shot's field of view. A scripted move overrides all of it.
  useFrame(({ camera, pointer, size }, delta) => {
    const c = controls.current;
    if (!c) return;
    drift.current += delta;
    if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - fov.current) > 0.01) {
      camera.fov = THREE.MathUtils.damp(camera.fov, fov.current, 4, delta);
      if (Math.abs(camera.fov - fov.current) < 0.05) camera.fov = fov.current;
      camera.updateProjectionMatrix();
    }
    if (STILL_POSE) {
      c.enabled = false;
      c.minDistance = 0.1;
      c.maxDistance = 5000;
      c.minPolarAngle = 0;
      c.maxPolarAngle = Math.PI;
      fov.current = STILL_POSE.fov;
      c.setLookAt(...STILL_POSE.p, ...STILL_POSE.t, false);
      return;
    }
    const m = move.current;
    if (transition && m) {
      runMove(c, transition, m, endTransition);
      return;
    }
    // The landing's flight. While the page drives it, the frame loop places the camera from the scroll and
    // the user's orbit is off (the page is the control); limits open up because the path runs closer and
    // lower than the picker allows. Ownership is decided here, every frame, so it survives whatever order
    // the route, the chapter and the store settle in: a flight that starts before the city is on screen
    // (back from a room to `/`) simply takes over on the first city frame.
    const flying = flightActive && chapter === "city";
    if (flying && !flightOwned.current) {
      flightOwned.current = true;
      landing.current = false;
      flightPose.inFlight = true;
      // right after a cut start where the scroll says; with the city already on screen (arriving from the
      // picker) fly up from its pose instead of cutting
      flightU.current =
        performance.now() - cityShownAt.current > 1200 ? FLIGHT_KEYS.length - 1 : useFlight.getState().target;
      c.enabled = false;
      c.minDistance = 1;
      c.maxDistance = 1000;
      c.minPolarAngle = 0;
      c.maxPolarAngle = Math.PI;
    } else if (!flying && flightOwned.current && !landing.current) {
      if (chapter === "city") {
        // `/` → `/city`: finish the path to the picker's pose, one continuous shot
        landing.current = true;
      } else {
        // a dive or a cut took the camera: the transition and chapter effects own it from here
        flightOwned.current = false;
        flightPose.inFlight = false;
        flightPose.u = FLIGHT_KEYS.length - 1;
        if (!transition) c.enabled = true;
      }
    }
    if (flightOwned.current) {
      // back on `/` before the landing finished: follow the scroll again from wherever the camera is
      if (flying) landing.current = false;
      const end = FLIGHT_KEYS.length - 1;
      const target = landing.current ? end : useFlight.getState().target;
      let u = damp(flightU.current, target, FLIGHT_DAMPING, delta);
      if (Math.abs(u - target) < 0.0005) u = target;
      flightU.current = u;
      flightPose.u = u;
      const sample = sampleFlight(size.width < size.height ? PORTRAIT_KEYS : FLIGHT_KEYS, u, flightSample);
      fov.current = sample.fov;
      const [px, py, pz] = sample.position;
      const [tx, ty, tz] = sample.target;
      c.setLookAt(px, py, pz, tx, ty, tz, false);
      if (landing.current && u === end) {
        // landed on the picker's pose: the user's orbit is back
        flightOwned.current = false;
        landing.current = false;
        flightPose.inFlight = false;
        cityLimits(c);
        c.enabled = true;
        fov.current = DEFAULT_FOV;
        return;
      }
      if (finePointer) {
        // the pose is rebuilt every frame, so the parallax is applied as an absolute lean, not a delta
        const p = parallax.current;
        p.yaw = THREE.MathUtils.damp(p.yaw, pointer.x * PARALLAX_YAW, 3, delta);
        p.pitch = THREE.MathUtils.damp(p.pitch, -pointer.y * PARALLAX_PITCH, 3, delta);
        c.rotate(p.yaw, p.pitch, false);
      }
      return;
    }
    if (chapter === "city") {
      const lean = focusBeacon != null ? beaconSlot(focusBeacon) : null;
      const target = lean ? tmpT.set(lean[0] * 0.35, CITY.target.y, lean[1] * 0.35) : CITY.target;
      const current = c.getTarget(tmpP);
      current.lerp(target, 0.02);
      c.setTarget(current.x, current.y, current.z, false);
      let yaw = delta * 0.012;
      let pitch = 0;
      if (finePointer && !dragging.current) {
        const p = parallax.current;
        const nextYaw = THREE.MathUtils.damp(p.yaw, pointer.x * PARALLAX_YAW, 3, delta);
        const nextPitch = THREE.MathUtils.damp(p.pitch, -pointer.y * PARALLAX_PITCH, 3, delta);
        yaw += nextYaw - p.yaw;
        pitch += nextPitch - p.pitch;
        p.yaw = nextYaw;
        p.pitch = nextPitch;
      }
      c.rotate(yaw, pitch, false);
    }
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      smoothTime={0.55}
      draggingSmoothTime={0.12}
      dollySpeed={0.6}
      truckSpeed={0}
      maxSpeed={60}
      mouseButtons={{ left: 1, middle: 0, right: 0, wheel: 16 }} // ROTATE · none · none · DOLLY
      touches={{ one: 64, two: 1024, three: 0 }} // TOUCH_ROTATE · TOUCH_DOLLY · none
    />
  );
}

/** One frame of the scripted move: the dive accelerates into the light, the descent eases out of it. */
function runMove(c: CameraControls, transition: Transition, m: Move, done: () => void) {
  const elapsed = performance.now() - transition.startedAt;
  if (transition.kind === "dive") {
    const k = THREE.MathUtils.clamp(elapsed / DIVE_MS, 0, 1);
    const kp = k * k * (0.55 + 0.45 * k);
    const kt = k * k * (3 - 2 * k);
    tmpP.lerpVectors(m.p0, m.p1, kp);
    tmpT.lerpVectors(m.t0, m.t1, kt);
    c.setLookAt(tmpP.x, tmpP.y, tmpP.z, tmpT.x, tmpT.y, tmpT.z, false);
    return;
  }
  const k = THREE.MathUtils.clamp(elapsed / DESCENT_MS, 0, 1);
  const e = 1 - (1 - k) ** 3;
  tmpP.lerpVectors(m.p0, m.p1, e);
  tmpT.lerpVectors(m.t0, m.t1, e);
  c.setLookAt(tmpP.x, tmpP.y, tmpP.z, tmpT.x, tmpT.y, tmpT.z, false);
  if (k >= 1) done();
}
