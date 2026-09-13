import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

let chair: THREE.BufferGeometry | null = null;
let booth: THREE.BufferGeometry | null = null;
let spot: THREE.BufferGeometry | null = null;

/** Theatre / grandstand chair: cushion, back, two arms. Origin at the floor, facing +z before yaw. */
export function chairGeometry(): THREE.BufferGeometry {
  if (chair) return chair;
  const parts = [
    box(0.46, 0.09, 0.44, 0, 0.42, 0),
    box(0.46, 0.5, 0.08, 0, 0.7, -0.2),
    box(0.06, 0.24, 0.42, -0.26, 0.56, 0.02),
    box(0.06, 0.24, 0.42, 0.26, 0.56, 0.02),
    box(0.08, 0.4, 0.08, 0, 0.2, 0.12),
  ];
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  for (const p of parts) p.dispose();
  chair = merged;
  return merged;
}

/** Mezzanine booth: a low curved-ish sofa and a small table. Faces +z. */
export function boothGeometry(): THREE.BufferGeometry {
  if (booth) return booth;
  const parts = [
    box(1.9, 0.42, 0.7, 0, 0.21, -0.25),
    box(1.9, 0.5, 0.14, 0, 0.66, -0.55),
    box(0.16, 0.5, 0.7, -0.87, 0.5, -0.25),
    box(0.16, 0.5, 0.7, 0.87, 0.5, -0.25),
    new THREE.CylinderGeometry(0.34, 0.3, 0.06, 20).translate(0, 0.52, 0.5),
    new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).translate(0, 0.26, 0.5),
  ];
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  for (const p of parts) p.dispose();
  booth = merged;
  return merged;
}

/** Standing spot on the club floor: a shallow disc with a raised ring so it catches light. */
export function spotGeometry(): THREE.BufferGeometry {
  if (spot) return spot;
  const parts = [
    new THREE.CylinderGeometry(0.28, 0.3, 0.05, 28).translate(0, 0.025, 0),
    new THREE.TorusGeometry(0.28, 0.03, 8, 40).rotateX(Math.PI / 2).translate(0, 0.06, 0),
  ];
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  for (const p of parts) p.dispose();
  spot = merged;
  return merged;
}

export function geometryFor(shape: "spot" | "booth" | "chair"): THREE.BufferGeometry {
  if (shape === "spot") return spotGeometry();
  if (shape === "booth") return boothGeometry();
  return chairGeometry();
}
