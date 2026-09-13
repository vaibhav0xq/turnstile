import { CameraControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { VenueLayout } from "../venues/layout";
import { seatFocus, seatViewpoint } from "../venues/layout";
import { beaconSlot } from "./City";
import { useDirector } from "./director";

interface CameraRigProps {
  layout: VenueLayout | null;
  /** Index of the hovered/selected event in the city (for a gentle lean toward its beacon). */
  focusBeacon: number | null;
}

const CITY = { position: new THREE.Vector3(0, 78, 236), target: new THREE.Vector3(0, 18, 0) };

export function CameraRig({ layout, focusBeacon }: CameraRigProps) {
  const controls = useRef<CameraControls>(null);
  const chapter = useDirector((s) => s.chapter);
  const viewMode = useDirector((s) => s.viewMode);
  const viewSeat = useDirector((s) => s.viewSeat);
  const revealStartedAt = useDirector((s) => s.revealStartedAt);
  const drift = useRef(0);

  // Chapter changes: place the camera without transition right after a cut, then ease into the waypoint.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every cut (revealStartedAt)
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (chapter === "city") {
      c.minDistance = 120;
      c.maxDistance = 360;
      c.minPolarAngle = 0.55;
      c.maxPolarAngle = 1.32;
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
    const wp = chapter === "gate" ? layout.camera.entrance : layout.camera.overview;
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

  // View from a seat ↔ overview.
  useEffect(() => {
    const c = controls.current;
    if (!c || !layout || chapter === "city") return;
    if ((viewMode === "seat" || viewMode === "focus") && viewSeat != null) {
      const seat = layout.byId.get(viewSeat);
      if (!seat) return;
      const wp = viewMode === "seat" ? seatViewpoint(layout, seat) : seatFocus(layout, seat);
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
      const wp = chapter === "gate" ? layout.camera.entrance : layout.camera.overview;
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

  // Idle drift: the city slowly orbits; the venue breathes.
  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    drift.current += delta;
    if (chapter === "city") {
      const lean = focusBeacon != null ? beaconSlot(focusBeacon) : null;
      const target = lean ? new THREE.Vector3(lean[0] * 0.35, CITY.target.y, lean[1] * 0.35) : CITY.target;
      const current = c.getTarget(new THREE.Vector3());
      current.lerp(target, 0.02);
      c.setTarget(current.x, current.y, current.z, false);
      c.rotate(delta * 0.012, 0, false);
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
