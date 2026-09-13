import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { EventInfo } from "../chain/config";
import { useDirector } from "./director";
import { beaconShader, useShaderMaterial } from "./materials";

/** Where each event's beacon stands in the city; the venue itself is rendered at the origin later. */
export const BEACON_SLOTS: Array<[number, number]> = [
  [-38, -22],
  [44, 12],
  [-12, 52],
  [22, -58],
  [-62, 24],
  [66, -34],
];

export function beaconSlot(index: number): [number, number] {
  return BEACON_SLOTS[index % BEACON_SLOTS.length] ?? [0, 0];
}

const cityVertex = /* glsl */ `
  attribute vec3 aScatter;
  attribute float aSeed;
  attribute float aSize;
  attribute float aWarm;
  uniform float uTime;
  uniform float uProgress;
  uniform float uPixelRatio;
  uniform float uDim;
  varying float vWarm;
  varying float vAlpha;

  float easeOut(float t) { return 1.0 - pow(1.0 - t, 3.0); }

  void main() {
    float local = clamp(uProgress * 1.35 - aSeed * 0.35, 0.0, 1.0);
    float k = easeOut(local);
    vec3 p = mix(aScatter, position, k);
    // buildings breathe very slightly so the skyline never reads as a still image
    p.y += sin(uTime * 0.6 + aSeed * 12.0) * 0.06;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float flicker = 0.85 + 0.15 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0);
    gl_PointSize = max(2.0 * uPixelRatio, aSize * uPixelRatio * flicker * (240.0 / -mv.z));
    gl_Position = projectionMatrix * mv;
    vWarm = aWarm;
    // haze: far windows dissolve into the night
    float fade = exp(-max(0.0, -mv.z - 160.0) * 0.0024);
    vAlpha = k * (0.55 + 0.45 * flicker) * fade * uDim;
  }
`;

const cityFragment = /* glsl */ `
  uniform vec3 uWarm;
  uniform vec3 uCool;
  varying float vWarm;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = 1.0 - smoothstep(0.1, 0.5, d);
    vec3 col = mix(uCool, uWarm, vWarm);
    gl_FragColor = vec4(col * (0.6 + 0.5 * vWarm), a * vAlpha);
  }
`;

const skyVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  varying vec3 vWorld;
  void main() {
    // elevation of the view ray, so the horizon stays where the camera sees it
    float h = normalize(vWorld - cameraPosition).y;
    float band = 1.0 - smoothstep(0.0, 0.34, abs(h));
    vec3 col = mix(uZenith, uHorizon, band);
    // light pollution over downtown, warmest straight ahead
    float toward = 0.5 + 0.5 * dot(normalize(vec2(vWorld.x, vWorld.z)), vec2(0.0, -1.0));
    col += uGlow * pow(band, 3.0) * (0.35 + 0.65 * toward) * smoothstep(-0.02, 0.08, h);
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  seed: number;
}

interface CityData {
  buildings: Building[];
  positions: Float32Array;
  scatter: Float32Array;
  seeds: Float32Array;
  sizes: Float32Array;
  warm: Float32Array;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic downtown: blocks on a grid, towers near the centre, lit windows as points. */
function buildCity(beacons: Array<[number, number]>): CityData {
  const rnd = mulberry(1337);
  const buildings: Building[] = [];
  const pos: number[] = [];
  const sca: number[] = [];
  const seed: number[] = [];
  const size: number[] = [];
  const warm: number[] = [];
  const block = 14;
  const street = 6;
  const pitch = block + street;
  const half = 12;
  const push = (x: number, y: number, z: number, s: number, w: number) => {
    pos.push(x, y, z);
    const r = 260 + rnd() * 160;
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(2 * rnd() - 1);
    sca.push(r * Math.sin(ph) * Math.cos(th), 60 + r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th));
    seed.push(rnd());
    size.push(s);
    warm.push(w);
  };
  for (let bx = -half; bx < half; bx++) {
    for (let bz = -half; bz < half; bz++) {
      const cx = bx * pitch + pitch / 2;
      const cz = bz * pitch + pitch / 2;
      const beaconDist = Math.min(...beacons.map(([x, z]) => Math.hypot(x - cx, z - cz)));
      if (beaconDist < 18) continue;
      const dist = Math.hypot(cx, cz);
      const downtown = Math.max(0, 1 - dist / 170);
      // keep the skyline low next to a beacon so the light column always stands clear
      const cap = beaconDist < 60 ? 22 : 64;
      // 1–3 buildings per block
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const w = 4 + rnd() * (block / n - 1.5);
        const d = 4 + rnd() * (block - 2);
        const h = Math.min(cap, 5 + rnd() * 14 + downtown * downtown * (30 + rnd() * 70));
        const ox = cx - block / 2 + w / 2 + (i * block) / n;
        const oz = cz - block / 2 + d / 2 + rnd() * Math.max(0, block - d);
        const warmth = rnd() < 0.7 ? 0.75 + rnd() * 0.25 : rnd() * 0.3;
        const density = 0.45 + downtown * 0.25;
        buildings.push({ x: ox, z: oz, w, d, h, seed: rnd() });
        // windows on four faces, pushed just off the wall so they never z-fight with it
        const lift = 0.12;
        const faces: Array<[number, number, number, number, number]> = [
          [ox - w / 2, oz - d / 2 - lift, 1, 0, w], // south
          [ox - w / 2, oz + d / 2 + lift, 1, 0, w], // north
          [ox - w / 2 - lift, oz - d / 2, 0, 1, d], // west
          [ox + w / 2 + lift, oz - d / 2, 0, 1, d], // east
        ];
        for (const [sx, sz, dx, dz, len] of faces) {
          const cols = Math.max(1, Math.floor(len / 2.2));
          const rows = Math.max(1, Math.floor(h / 3.0));
          for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
              if (rnd() > density) continue;
              const u = (c + 0.5) / cols;
              push(sx + dx * len * u, 1.5 + r * 3.0, sz + dz * len * u, 1.3 + rnd() * 1.3, warmth);
            }
          }
        }
        // roof edge lights on the taller blocks define the skyline
        if (h > 26) {
          const step = 2.6;
          for (let s = -w / 2; s <= w / 2; s += step) {
            push(ox + s, h + 0.15, oz - d / 2, 1.1, 0.2);
            push(ox + s, h + 0.15, oz + d / 2, 1.1, 0.2);
          }
          for (let s = -d / 2 + step; s < d / 2; s += step) {
            push(ox - w / 2, h + 0.15, oz + s, 1.1, 0.2);
            push(ox + w / 2, h + 0.15, oz + s, 1.1, 0.2);
          }
        }
        // aviation light on the tallest towers
        if (h > 56) push(ox, h + 0.6, oz, 4, 0.05);
      }
    }
  }
  // suburbs: loose scatter of low lights out to the haze, thinning with distance
  for (let i = 0; i < 26000; i++) {
    const r = 250 + rnd() ** 0.6 * 650;
    const th = rnd() * Math.PI * 2;
    if (rnd() < (r - 250) / 900) continue;
    const warmth = rnd() < 0.8 ? 0.7 + rnd() * 0.3 : rnd() * 0.3;
    push(Math.cos(th) * r, 0.6 + rnd() * rnd() * 14, Math.sin(th) * r, 1.4 + rnd() * 1.6, warmth);
  }
  // street lights along the grid
  for (let i = -half; i <= half; i++) {
    for (let t = -half * pitch; t <= half * pitch; t += 9) {
      push(i * pitch, 0.4, t, 2.0, 0.95);
      push(t, 0.4, i * pitch, 2.0, 0.95);
    }
  }
  return {
    buildings,
    positions: new Float32Array(pos),
    scatter: new Float32Array(sca),
    seeds: new Float32Array(seed),
    sizes: new Float32Array(size),
    warm: new Float32Array(warm),
  };
}

interface CityProps {
  events: EventInfo[];
  onEnter: (event: EventInfo) => void;
}

export function City({ events, onEnter }: CityProps) {
  const beacons = useMemo(() => events.map((_, i) => beaconSlot(i)), [events]);
  const data = useMemo(() => buildCity(BEACON_SLOTS), []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute("aScatter", new THREE.BufferAttribute(data.scatter, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(data.seeds, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(data.sizes, 1));
    g.setAttribute("aWarm", new THREE.BufferAttribute(data.warm, 1));
    g.computeBoundingSphere();
    return g;
  }, [data]);
  const material = useShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uDim: { value: 1.0 },
      uWarm: { value: new THREE.Color("#ffc98a") },
      uCool: { value: new THREE.Color("#8fd6ff") },
    },
    vertexShader: cityVertex,
    fragmentShader: cityFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const uniforms = material.uniforms;
  const started = useRef(performance.now());
  const revealStartedAt = useDirector((s) => s.revealStartedAt);
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart the resolve animation on every cut
  useEffect(() => {
    started.current = performance.now();
  }, [revealStartedAt]);
  useFrame(({ clock }) => {
    const time = uniforms["uTime"];
    if (time) time.value = clock.getElapsedTime();
    const progress = uniforms["uProgress"];
    if (progress) progress.value = THREE.MathUtils.clamp((performance.now() - started.current) / 3200, 0, 1);
  });
  useEffect(() => () => geometry.dispose(), [geometry]);

  const sky = useShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color("#05060a") },
      uHorizon: { value: new THREE.Color("#141a2c") },
      uGlow: { value: new THREE.Color("#3a2414") },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
  });

  return (
    <group>
      <mesh material={sky} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[850, 32, 16]} />
      </mesh>
      <hemisphereLight args={["#34405f", "#07080c", 1.6]} />
      <Streets />
      <Buildings buildings={data.buildings} startedAt={started} />
      <points geometry={geometry} material={material} frustumCulled={false} />
      {/* ground plane catches the hemisphere light faintly and hides the horizon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <planeGeometry args={[6000, 6000]} />
        <meshBasicMaterial color="#090a10" />
      </mesh>
      {events.map((event, i) => (
        <Beacon key={event.address} event={event} position={beacons[i] ?? [0, 0]} onEnter={onEnter} />
      ))}
    </group>
  );
}

const tmpObject = new THREE.Object3D();

/** Faint street grid: gives the ground perspective without competing with the windows. */
function Streets() {
  const geometry = useMemo(() => {
    const half = 12;
    const pitch = 20;
    const extent = half * pitch;
    const verts: number[] = [];
    for (let i = -half; i <= half; i++) {
      const a = i * pitch;
      verts.push(a, 0.05, -extent, a, 0.05, extent);
      verts.push(-extent, 0.05, a, extent, 0.05, a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        color="#4a3320"
        transparent
        opacity={0.45}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/** Dark building masses the windows sit on; they rise out of the ground during the reveal. */
function Buildings({ buildings, startedAt }: { buildings: Building[]; startedAt: RefObject<number> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lastProgress = useRef(-1);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const progress = THREE.MathUtils.clamp((performance.now() - startedAt.current) / 3200, 0, 1);
    if (progress === lastProgress.current) return;
    lastProgress.current = progress;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (!b) continue;
      const local = THREE.MathUtils.clamp(progress * 1.35 - b.seed * 0.35, 0, 1);
      const k = 1 - (1 - local) ** 3;
      const h = Math.max(0.01, b.h * k);
      tmpObject.position.set(b.x, h / 2, b.z);
      tmpObject.scale.set(b.w, h, b.d);
      tmpObject.updateMatrix();
      m.setMatrixAt(i, tmpObject.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, buildings.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#1a1f33"
        emissive="#0e1120"
        emissiveIntensity={1}
        roughness={0.9}
        metalness={0.05}
      />
    </instancedMesh>
  );
}

function Beacon({
  event,
  position,
  onEnter,
}: {
  event: EventInfo;
  position: [number, number];
  onEnter: (event: EventInfo) => void;
}) {
  const material = useShaderMaterial({
    ...beaconShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const uniforms = material.uniforms;
  const hovered = useDirector((s) => s.hoveredBeacon === event.address);
  const hover = useDirector((s) => s.hoverBeacon);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const time = uniforms["uTime"];
    if (time) time.value = t;
    const boost = uniforms["uBoost"];
    if (boost) boost.value = THREE.MathUtils.lerp(boost.value as number, hovered ? 1 : 0, 0.12);
    if (ring.current) {
      const s = 1 + 0.08 * Math.sin(t * 2.2);
      ring.current.scale.setScalar(s * (hovered ? 1.25 : 1));
    }
  });
  const [x, z] = position;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 45, 0]} material={material}>
        <cylinderGeometry args={[1.4, 2.2, 90, 24, 1, true]} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[4.2, 4.8, 64]} />
        <meshBasicMaterial
          color="#ffb457"
          toneMapped={false}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[4.2, 48]} />
        <meshBasicMaterial color="#ffb457" toneMapped={false} transparent opacity={hovered ? 0.35 : 0.14} />
      </mesh>
      <pointLight
        position={[0, 6, 0]}
        intensity={hovered ? 60 : 30}
        distance={60}
        color="#ffb457"
        decay={1.5}
      />
      {/* generous hit target */}
      <mesh
        position={[0, 20, 0]}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          hover(event.address);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          hover(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onEnter(event);
        }}
      >
        <cylinderGeometry args={[7, 7, 40, 12]} />
        <meshBasicMaterial />
      </mesh>
      <Html position={[0, 12, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div
          className={`chip mono whitespace-nowrap transition-opacity ${hovered ? "opacity-100" : "opacity-70"}`}
        >
          <span className="dot" />
          {event.name}
        </div>
      </Html>
    </group>
  );
}
