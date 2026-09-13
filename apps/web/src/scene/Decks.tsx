import { useMemo } from "react";
import * as THREE from "three";
import { rowArcs } from "../venues/decks";
import type { VenueLayout } from "../venues/layout";

/** RingGeometry (in its own XY plane) rotated -90° about X maps shape angle φ to cylinder angle θ = φ + π/2. */
const ringStart = (thetaStart: number) => thetaStart - Math.PI / 2;

export function Decks({ layout, lips }: { layout: VenueLayout; lips: boolean }) {
  const arcs = useMemo(() => rowArcs(layout), [layout]);
  const tone = layout.kind === "theatre" ? "#24111a" : "#0f1015";
  const lipColor = layout.kind === "theatre" ? "#ffd9a3" : "#ffb457";
  const { x, z } = layout.center;
  return (
    <group position={[x, 0, z]}>
      {arcs.map((a) => (
        <group key={a.key}>
          <mesh position={[0, a.y - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[a.inner, a.outer, 48, 1, ringStart(a.thetaStart), a.thetaLength]} />
            <meshStandardMaterial color={tone} roughness={0.6} metalness={0.3} side={THREE.DoubleSide} />
          </mesh>
          {a.riser > 0.04 ? (
            <mesh position={[0, a.y - 0.02 - a.riser / 2, 0]}>
              <cylinderGeometry
                args={[a.inner, a.inner, a.riser, 48, 1, true, a.thetaStart, a.thetaLength]}
              />
              <meshStandardMaterial color={tone} roughness={0.65} metalness={0.25} side={THREE.DoubleSide} />
            </mesh>
          ) : null}
          {lips && a.lip ? (
            <mesh position={[0, a.y + 0.06, 0]}>
              <cylinderGeometry
                args={[a.inner + 0.02, a.inner + 0.02, 0.04, 96, 1, true, a.thetaStart, a.thetaLength]}
              />
              <meshBasicMaterial color={lipColor} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}
