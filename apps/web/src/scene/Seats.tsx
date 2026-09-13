import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type SeatMap, seatStatus } from "../chain/seats";
import type { SeatSpec, SectionSpec, VenueLayout } from "../venues/layout";
import { seatAnchor } from "./anchor";
import { useDirector } from "./director";
import { geometryFor } from "./geometry";
import { makeGlowMaterial } from "./materials";

const COLORS = {
  cyan: new THREE.Color("#7ee7ff"),
  amber: new THREE.Color("#ffb457"),
  green: new THREE.Color("#59f2a1"),
  violet: new THREE.Color("#b58cff"),
  soldBody: new THREE.Color("#121317"),
  black: new THREE.Color("#000000"),
};

interface SeatsProps {
  layout: VenueLayout;
  seatMap: SeatMap | undefined;
  interactive: boolean;
}

export function Seats({ layout, seatMap, interactive }: SeatsProps) {
  const hovered = useDirector((s) => s.hoveredSeat);
  const selected = useDirector((s) => s.selectedSeat);
  const cardSeat = selected ?? hovered;
  const spec = cardSeat != null ? layout.byId.get(cardSeat) : undefined;
  return (
    <group>
      {layout.sections.map((section) => (
        <SectionInstances
          key={`${section.tier}-${section.name}`}
          layout={layout}
          section={section}
          seatMap={seatMap}
          interactive={interactive}
        />
      ))}
      {spec ? (
        <CardAnchor x={spec.x} y={spec.y + (section(layout, spec).shape === "spot" ? 0.4 : 1.1)} z={spec.z} />
      ) : null}
    </group>
  );
}

const anchorWorld = new THREE.Vector3();

/** Projects the card seat to the screen each frame and moves the DOM card there (see anchor.ts). */
function CardAnchor({ x, y, z }: { x: number; y: number; z: number }) {
  useFrame(({ camera, size }) => {
    const el = seatAnchor.el;
    if (!el) return;
    anchorWorld.set(x, y, z).project(camera);
    const behind = anchorWorld.z > 1;
    const sx = (anchorWorld.x * 0.5 + 0.5) * size.width;
    const sy = (-anchorWorld.y * 0.5 + 0.5) * size.height;
    el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
    el.style.visibility = behind ? "hidden" : "visible";
  });
  return null;
}

function section(layout: VenueLayout, seat: SeatSpec): SectionSpec {
  return layout.sections.find((s) => s.tier === seat.tier) ?? (layout.sections[0] as SectionSpec);
}

interface SectionProps {
  layout: VenueLayout;
  section: SectionSpec;
  seatMap: SeatMap | undefined;
  interactive: boolean;
}

function SectionInstances({ layout, section, seatMap, interactive }: SectionProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seats = useMemo(
    () => section.seatIds.map((id) => layout.byId.get(id)).filter((s): s is SeatSpec => Boolean(s)),
    [layout, section],
  );
  const count = seats.length;
  const accent = useMemo(() => new THREE.Color(section.accent), [section.accent]);
  const body = useMemo(() => new THREE.Color(section.body), [section.body]);

  const geometry = useMemo(() => {
    const g = geometryFor(section.shape).clone();
    g.setAttribute("aGlow", new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [section.shape, count]);
  const material = useMemo(
    () =>
      makeGlowMaterial(
        section.shape === "spot"
          ? { roughness: 0.35, metalness: 0.6 }
          : section.shape === "booth"
            ? { roughness: 0.75, metalness: 0.05 }
            : { roughness: 0.7, metalness: 0.1 },
      ),
    [section.shape],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Target glow per seat (before the reveal ramp) and the state that drives it.
  const target = useRef(new Float32Array(count * 3));
  const revealDone = useRef(false);
  const hovered = useDirector((s) => s.hoveredSeat);
  const selected = useDirector((s) => s.selectedSeat);
  const mine = useDirector((s) => s.mine);
  const revealStartedAt = useDirector((s) => s.revealStartedAt);

  // Instance transforms — once per layout.
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    seats.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.rotation.set(0, s.rotY, 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [seats]);

  // Colours + glow targets whenever chain state or interaction changes.
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    const g = new THREE.Color();
    const t = target.current;
    seats.forEach((s, i) => {
      const status = seatStatus(seatMap?.get(s.id));
      const isMine = mine.has(s.id);
      const isSelected = selected === s.id;
      const isHovered = hovered === s.id;
      c.copy(body);
      if (status === "available") {
        g.copy(accent).multiplyScalar(
          section.shape === "spot" ? 0.42 : section.shape === "booth" ? 0.14 : 0.26,
        );
      } else if (status === "checkedIn") {
        g.copy(COLORS.green).multiplyScalar(0.55);
      } else if (status === "listed") {
        g.copy(COLORS.violet).multiplyScalar(0.6);
      } else {
        c.copy(COLORS.soldBody);
        g.copy(COLORS.black);
      }
      if (isMine) {
        g.copy(COLORS.cyan).multiplyScalar(status === "checkedIn" ? 0.9 : 0.85);
        c.copy(body).lerp(COLORS.cyan, 0.15);
      }
      if (isHovered && interactive && (status === "available" || status === "listed" || isMine)) {
        g.copy(isMine ? COLORS.cyan : status === "listed" ? COLORS.violet : COLORS.amber).multiplyScalar(
          1.35,
        );
      }
      if (isSelected) {
        g.copy(COLORS.cyan).multiplyScalar(1.6);
        c.copy(body).lerp(COLORS.cyan, 0.25);
      }
      m.setColorAt(i, c);
      t[i * 3] = g.r;
      t[i * 3 + 1] = g.g;
      t[i * 3 + 2] = g.b;
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (revealDone.current) {
      const attr = geometry.getAttribute("aGlow") as THREE.InstancedBufferAttribute;
      attr.array.set(t);
      attr.needsUpdate = true;
    }
  }, [seats, seatMap, mine, selected, hovered, interactive, accent, body, geometry, section.shape]);

  // Hover lift.
  const lifted = useRef<number | null>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const apply = (index: number, lift: number, scale: number) => {
      const s = seats[index];
      if (!s) return;
      o.position.set(s.x, s.y + lift, s.z);
      o.rotation.set(0, s.rotY, 0);
      o.scale.setScalar(scale);
      o.updateMatrix();
      m.setMatrixAt(index, o.matrix);
    };
    if (lifted.current != null) apply(lifted.current, 0, 1);
    const idx = hovered != null ? seats.findIndex((s) => s.id === hovered) : -1;
    if (idx >= 0 && interactive) {
      apply(idx, section.shape === "spot" ? 0.03 : 0.06, 1.06);
      lifted.current = idx;
    } else {
      lifted.current = null;
    }
    m.instanceMatrix.needsUpdate = true;
  }, [hovered, seats, interactive, section.shape]);

  // House lights come up row by row after a cut.
  // biome-ignore lint/correctness/useExhaustiveDependencies: replay the reveal on every cut
  useEffect(() => {
    revealDone.current = false;
  }, [revealStartedAt]);
  useFrame(() => {
    if (revealDone.current) return;
    const attr = geometry.getAttribute("aGlow") as THREE.InstancedBufferAttribute;
    const arr = attr.array as Float32Array;
    const elapsed = (performance.now() - revealStartedAt) / 1000;
    let all = true;
    const t = target.current;
    for (let i = 0; i < count; i++) {
      const s = seats[i];
      const delay = 0.25 + (s ? (s.z - layout.stage.z) * 0.035 + s.y * 0.05 : 0);
      const k = THREE.MathUtils.smoothstep(elapsed, delay, delay + 0.7);
      if (k < 1) all = false;
      arr[i * 3] = (t[i * 3] ?? 0) * k;
      arr[i * 3 + 1] = (t[i * 3 + 1] ?? 0) * k;
      arr[i * 3 + 2] = (t[i * 3 + 2] ?? 0) * k;
    }
    attr.needsUpdate = true;
    if (all) revealDone.current = true;
  });

  const hover = useDirector((s) => s.hoverSeat);
  const select = useDirector((s) => s.selectSeat);
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    const s = e.instanceId != null ? seats[e.instanceId] : undefined;
    hover(s ? s.id : null);
    document.body.style.cursor = s ? "pointer" : "";
  };
  const onOut = () => {
    if (!interactive) return;
    hover(null);
    document.body.style.cursor = "";
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    const s = e.instanceId != null ? seats[e.instanceId] : undefined;
    if (!s) return;
    select(useDirector.getState().selectedSeat === s.id ? null : s.id);
  };

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, count]}
      frustumCulled={false}
      onPointerMove={onMove}
      onPointerOut={onOut}
      onClick={onClick}
    />
  );
}
