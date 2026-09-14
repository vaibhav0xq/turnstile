import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { EventInfo } from "../chain/config";
import {
  GATE_LANES,
  GATE_LINE_Z,
  GATE_PITCH,
  PAVILION,
  PLAZA_LAMP_X,
  PLAZA_LAMP_Z,
  plazaFrame,
} from "./city-gen";
import { codePanelTexture, lobbyTexture, marqueeTexture } from "./signage";

/**
 * A venue's street presence on its plaza: the pavilion the beacon's column rises from, the lit lobby and
 * the marquee over the doors, the turnstile line in front of them, lamp posts at the corners. Local frame
 * per `plazaFrame`: the doors face local +z, the gate line runs along x.
 */

const body = new THREE.MeshStandardMaterial({ color: "#2b2f3a", roughness: 0.9, metalness: 0.05 });
const trim = new THREE.MeshStandardMaterial({ color: "#1a1c24", roughness: 0.7, metalness: 0.3 });
const metal = new THREE.MeshStandardMaterial({ color: "#1b1e26", roughness: 0.35, metalness: 0.7 });
const amber = new THREE.MeshBasicMaterial({ color: "#ffb457", toneMapped: false });
const glass = new THREE.MeshBasicMaterial({
  color: "#a9c8ff",
  transparent: true,
  opacity: 0.16,
  side: THREE.DoubleSide,
  depthWrite: false,
  toneMapped: false,
});

const unit = new THREE.BoxGeometry(1, 1, 1);
const plane = new THREE.PlaneGeometry(1, 1);
const pole = new THREE.CylinderGeometry(0.07, 0.09, 1, 8);

const tmp = new THREE.Object3D();

/** An instanced mesh of `count` unit boxes/planes, placed once by `place`. */
function Instances({
  geometry,
  material,
  count,
  place,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  count: number;
  place: (i: number, o: THREE.Object3D) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < count; i++) {
      tmp.position.set(0, 0, 0);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      place(i, tmp);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [count, place]);
  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />;
}

const { w: W, h: H, d: D } = PAVILION;
const FACE = D / 2;
const LANES = GATE_LANES;
const PEDESTALS = LANES + 1;
const LAMPS = PLAZA_LAMP_Z.length * 2;

const placePedestal = (i: number, o: THREE.Object3D) => {
  o.position.set((i - LANES / 2) * GATE_PITCH, 0.525, GATE_LINE_Z);
  o.scale.set(0.34, 1.05, 1.3);
};
const placeBar = (i: number, o: THREE.Object3D) => {
  o.position.set((i - LANES / 2) * GATE_PITCH, 1.075, GATE_LINE_Z);
  o.scale.set(0.36, 0.05, 1.32);
};
const placeWing = (i: number, o: THREE.Object3D) => {
  // a glass paddle across each lane, hinged from the left cabinet, ajar
  o.position.set((i - LANES / 2 + 0.5) * GATE_PITCH, 0.6, GATE_LINE_Z);
  o.rotation.y = 0.35;
  o.scale.set(GATE_PITCH - 0.5, 0.8, 1);
};
const placePanel = (i: number, o: THREE.Object3D) => {
  o.position.set((i - LANES / 2) * GATE_PITCH, 0.92, GATE_LINE_Z + 0.66);
  o.scale.set(0.24, 0.165, 1);
};
const placeBarrier = (i: number, o: THREE.Object3D) => {
  const side = i === 0 ? -1 : 1;
  o.position.set(side * ((LANES / 2) * GATE_PITCH + 0.17 + 1.2), 0.5, GATE_LINE_Z);
  o.rotation.y = Math.PI / 2;
  o.scale.set(1, 1, 2.4);
};
const placeRoofEdge = (i: number, o: THREE.Object3D) => {
  // four thin bars round the parapet
  const along = i % 2 === 0;
  const side = i < 2 ? -1 : 1;
  o.position.set(along ? 0 : side * (W / 2), H + 0.04, along ? side * (D / 2) : 0);
  o.scale.set(along ? W : 0.08, 0.08, along ? 0.08 : D);
};
/** roof plant: a chiller, two air handlers and a stair head, set back from the parapet */
const ROOF_UNITS: ReadonlyArray<[number, number, number, number, number]> = [
  // x, z, w, h, d
  [-5.5, -2.5, 3.2, 1.3, 2.2],
  [-1.2, -3, 2.2, 1.0, 1.8],
  [2.4, -2.8, 2.2, 1.0, 1.8],
  [6.2, 2.2, 2.6, 2.1, 2.6],
];
const placeRoofUnit = (i: number, o: THREE.Object3D) => {
  const [x, z, w, h, d] = ROOF_UNITS[i] ?? [0, 0, 1, 1, 1];
  o.position.set(x, H + h / 2, z);
  o.scale.set(w, h, d);
};
const lampAt = (i: number): [number, number] => [
  i % 2 === 0 ? -PLAZA_LAMP_X : PLAZA_LAMP_X,
  PLAZA_LAMP_Z[Math.floor(i / 2)] ?? 0,
];
const placePole = (i: number, o: THREE.Object3D) => {
  const [x, z] = lampAt(i);
  o.position.set(x, 2.6, z);
  o.scale.set(1, 5.2, 1);
};
const placeLampHead = (i: number, o: THREE.Object3D) => {
  const [x, z] = lampAt(i);
  o.position.set(x, 5.25, z);
  o.scale.set(0.55, 0.14, 0.3);
};

export function Pavilion({ event, slot }: { event: EventInfo; slot: readonly [number, number] }) {
  const { yaw } = plazaFrame(slot);
  const marquee = useMemo(
    () =>
      new THREE.MeshBasicMaterial({ map: marqueeTexture(event.name), toneMapped: false, transparent: false }),
    [event.name],
  );
  const lobby = useMemo(() => new THREE.MeshBasicMaterial({ map: lobbyTexture(), toneMapped: false }), []);
  const panel = useMemo(
    () => new THREE.MeshBasicMaterial({ map: codePanelTexture(), toneMapped: false }),
    [],
  );
  return (
    <group rotation-y={yaw}>
      {/* the pavilion: a dark mass with a glazed ground floor, a canopy and the marquee over the doors */}
      <mesh geometry={unit} material={body} position={[0, H / 2 + 0.3, 0]} scale={[W, H - 0.3, D]} />
      <mesh geometry={unit} material={trim} position={[0, 0.15, 0]} scale={[W + 0.4, 0.3, D + 0.4]} />
      <mesh geometry={plane} material={lobby} position={[0, 1.95, FACE + 0.02]} scale={[W - 2, 3.1, 1]} />
      <mesh geometry={unit} material={trim} position={[0, 3.62, FACE + 1.1]} scale={[W - 4, 0.2, 2.4]} />
      <mesh geometry={unit} material={amber} position={[0, 3.5, FACE + 2.2]} scale={[W - 4.4, 0.03, 0.06]} />
      <mesh geometry={plane} material={marquee} position={[0, 4.62, FACE + 0.03]} scale={[10, 1.72, 1]} />
      <Instances geometry={unit} material={amber} count={4} place={placeRoofEdge} />
      <Instances geometry={unit} material={trim} count={ROOF_UNITS.length} place={placeRoofUnit} />

      {/* the turnstile line: cabinets with a lit bar, glass paddles, a code panel facing the queue */}
      <Instances geometry={unit} material={metal} count={PEDESTALS} place={placePedestal} />
      <Instances geometry={unit} material={amber} count={PEDESTALS} place={placeBar} />
      <Instances geometry={plane} material={glass} count={LANES} place={placeWing} />
      <Instances geometry={plane} material={panel} count={PEDESTALS} place={placePanel} />
      <Instances geometry={plane} material={glass} count={2} place={placeBarrier} />

      {/* lamp posts down both sides of the plaza */}
      <Instances geometry={pole} material={metal} count={LAMPS} place={placePole} />
      <Instances geometry={unit} material={amber} count={LAMPS} place={placeLampHead} />

      {/* the lobby's spill in front of the doors, and the lamps over the gate line */}
      <pointLight position={[0, 3.6, FACE + 3]} intensity={22} distance={26} color="#ffc98a" decay={1.6} />
      <pointLight
        position={[0, 5, GATE_LINE_Z + 1]}
        intensity={18}
        distance={22}
        color="#ffd9a8"
        decay={1.6}
      />
    </group>
  );
}
