import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { EventInfo } from "../chain/config";
import { mulberry } from "../lib/random";
import { keepOutRects } from "./anchor";
import { useDirector } from "./director";
import { flightPose, LABELS_FROM } from "./flight";
import {
  beaconShader,
  CITY_NIGHT,
  haloShader,
  makeMassMaterial,
  poolShader,
  useShaderMaterial,
} from "./materials";

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
    // aviation lights (aWarm > 1.5) blink slowly instead of flickering
    float beacon = step(1.5, aWarm);
    float blink = mix(1.0, smoothstep(0.35, 0.6, sin(uTime * 1.3 + aSeed * 50.0)), beacon);
    // clamped: a window a few units from the lens must stay a lamp, not a blob
    gl_PointSize = clamp(aSize * uPixelRatio * flicker * (240.0 / -mv.z), 2.0 * uPixelRatio, 9.0 * uPixelRatio);
    gl_Position = projectionMatrix * mv;
    vWarm = aWarm;
    // haze: far windows dissolve into the night
    float fade = exp(-max(0.0, -mv.z - 160.0) * 0.0024);
    vAlpha = k * (0.55 + 0.45 * flicker) * fade * uDim * blink;
  }
`;

const cityFragment = /* glsl */ `
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform vec3 uRed;
  varying float vWarm;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = 1.0 - smoothstep(0.1, 0.5, d);
    float beacon = step(1.5, vWarm);
    vec3 col = mix(mix(uCool, uWarm, vWarm) * (0.6 + 0.5 * vWarm), uRed, beacon);
    gl_FragColor = vec4(col, a * vAlpha);
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
    float band = 1.0 - smoothstep(0.0, 0.36, abs(h));
    vec3 col = mix(uZenith, uHorizon, band);
    // light pollution over downtown, warmest straight ahead
    float toward = 0.5 + 0.5 * dot(normalize(vec2(vWorld.x, vWorld.z)), vec2(0.0, -1.0));
    col += uGlow * pow(band, 3.0) * (0.35 + 0.65 * toward) * smoothstep(-0.02, 0.08, h);
    gl_FragColor = vec4(col, 1.0);
    // Encode like the built-in materials do, so the horizon band meets the fogged ground plane
    // in the same colour instead of a hard seam where the plane hits the far clip.
    #include <colorspace_fragment>
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
  skyline: Building[];
  positions: Float32Array;
  scatter: Float32Array;
  seeds: Float32Array;
  sizes: Float32Array;
  warm: Float32Array;
}

/**
 * The far skyline: clusters of tall slabs out in the haze, so the horizon is a city and not the edge of a
 * plane. Its own stream, so it never shifts the downtown generation.
 */
function buildSkyline(): Building[] {
  const rnd = mulberry(4242);
  const towers: Building[] = [];
  const clusters = 15;
  for (let c = 0; c < clusters; c++) {
    const angle = ((c + rnd() * 0.6) / clusters) * Math.PI * 2;
    const radius = 300 + rnd() * 180;
    const tall = rnd() < 0.35;
    const n = 6 + Math.floor(rnd() * 10);
    for (let i = 0; i < n; i++) {
      const spread = 24 + rnd() * 70;
      const a = angle + (rnd() - 0.5) * 0.28;
      const r = radius + (rnd() - 0.5) * spread;
      const w = 10 + rnd() * 18;
      const d = 10 + rnd() * 18;
      const h = (tall ? 60 : 28) + rnd() * (tall ? 95 : 50);
      towers.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w, d, h, seed: rnd() });
    }
  }
  // a low continuous belt between downtown and the clusters, so the ring never reads as islands
  for (let i = 0; i < 110; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 262 + rnd() * 70;
    towers.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      w: 9 + rnd() * 14,
      d: 9 + rnd() * 14,
      h: 14 + rnd() * 34,
      seed: rnd(),
    });
  }
  return towers;
}

/**
 * Deterministic downtown: blocks on a grid, towers near the centre, lit windows as points. `detail` scales the
 * point mass (windows, suburbs, street lights) for the low tier; the buildings themselves stay.
 */
function buildCity(beacons: Array<[number, number]>, detail = 1): CityData {
  // Two streams: `rnd` shapes the buildings and must be consumed identically at every tier, `drnd` feeds the
  // point mass that `detail` thins — otherwise a tier change would regenerate a different city.
  const rnd = mulberry(1337);
  const drnd = mulberry(7331);
  const buildings: Building[] = [];
  const skyline = buildSkyline();
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
    const r = 260 + drnd() * 160;
    const th = drnd() * Math.PI * 2;
    const ph = Math.acos(2 * drnd() - 1);
    sca.push(r * Math.sin(ph) * Math.cos(th), 60 + r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th));
    seed.push(drnd());
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
        const density = (0.45 + downtown * 0.25) * detail;
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
              if (drnd() > density) continue;
              const u = (c + 0.5) / cols;
              push(sx + dx * len * u, 1.5 + r * 3.0, sz + dz * len * u, 1.3 + drnd() * 1.3, warmth);
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
        if (h > 56) push(ox, h + 0.6, oz, 3.4, 2);
      }
    }
  }
  // suburbs: loose scatter of low lights out to the haze, thinning with distance
  for (let i = 0; i < 26000 * detail; i++) {
    const r = 250 + drnd() ** 0.6 * 650;
    const th = drnd() * Math.PI * 2;
    if (drnd() < (r - 250) / 900) continue;
    const warmth = drnd() < 0.8 ? 0.7 + drnd() * 0.3 : drnd() * 0.3;
    push(Math.cos(th) * r, 0.6 + drnd() * drnd() * 14, Math.sin(th) * r, 1.4 + drnd() * 1.6, warmth);
  }
  // street lights along the grid
  for (let i = -half; i <= half; i++) {
    for (let t = -half * pitch; t <= half * pitch; t += 9 / detail) {
      push(i * pitch, 0.4, t, 2.0, 0.95);
      push(t, 0.4, i * pitch, 2.0, 0.95);
    }
  }
  // the far towers carry a sparse scatter of windows and a red top, so the silhouette reads as inhabited
  for (const t of skyline) {
    const n = Math.floor((t.h / 6) * detail);
    for (let i = 0; i < n; i++) {
      const side = drnd() < 0.5 ? -1 : 1;
      const alongX = drnd() < 0.5;
      const u = drnd() - 0.5;
      push(
        t.x + (alongX ? u * t.w : (side * t.w) / 2),
        2 + drnd() * (t.h - 3),
        t.z + (alongX ? (side * t.d) / 2 : u * t.d),
        1.6 + drnd() * 1.2,
        drnd() < 0.75 ? 0.8 + drnd() * 0.2 : drnd() * 0.3,
      );
    }
    if (t.h > 90) push(t.x, t.h + 0.8, t.z, 3.8, 2);
  }
  return {
    buildings,
    skyline,
    positions: new Float32Array(pos),
    scatter: new Float32Array(sca),
    seeds: new Float32Array(seed),
    sizes: new Float32Array(size),
    warm: new Float32Array(warm),
  };
}

/**
 * The square around a beacon: market strings, lanterns and a crowd's worth of phone screens. One small point
 * cloud per present beacon, drawn with the city's point material so it resolves and dims with the rest.
 */
function plazaGeometry(slot: [number, number], detail: number): THREE.BufferGeometry {
  // Positions are local to the beacon group (which sits at the slot); the slot only seeds the layout.
  const rnd = mulberry(9001 + Math.round(slot[0] * 7 + slot[1] * 13));
  const pos: number[] = [];
  const sca: number[] = [];
  const seed: number[] = [];
  const size: number[] = [];
  const warm: number[] = [];
  const push = (x: number, y: number, z: number, s: number, w: number) => {
    pos.push(x, y, z);
    const r = 120 + rnd() * 120;
    const th = rnd() * Math.PI * 2;
    sca.push(x + Math.cos(th) * r, 40 + rnd() * 60, z + Math.sin(th) * r);
    seed.push(rnd());
    size.push(s);
    warm.push(w);
  };
  // strings of bulbs radiating from the column, sagging between posts
  const strings = 10;
  for (let k = 0; k < strings; k++) {
    const a = (k / strings) * Math.PI * 2 + rnd() * 0.3;
    const len = 12 + rnd() * 10;
    const n = Math.floor((len / 1.1) * detail);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const r = 5 + u * len;
      const sag = Math.sin(u * Math.PI * 3) * 0.35;
      push(Math.cos(a) * r, 3.4 - sag - u * 0.6, Math.sin(a) * r, 1.5, 0.85 + rnd() * 0.15);
    }
  }
  // lanterns on a ring of posts
  const posts = 14;
  for (let k = 0; k < posts; k++) {
    const a = (k / posts) * Math.PI * 2;
    push(Math.cos(a) * 9.5, 3.9, Math.sin(a) * 9.5, 3.0, 0.95);
  }
  // the crowd: dense near the column, thinning out to the streets, a cool screen glow here and there
  const crowd = Math.floor(260 * detail);
  for (let i = 0; i < crowd; i++) {
    const r = 5.5 + rnd() ** 0.7 * 20;
    const a = rnd() * Math.PI * 2;
    const cool = rnd() < 0.22;
    push(
      Math.cos(a) * r,
      0.5 + rnd() * 1.4,
      Math.sin(a) * r,
      1.1 + rnd() * 0.9,
      cool ? rnd() * 0.25 : 0.7 + rnd() * 0.3,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aScatter", new THREE.Float32BufferAttribute(sca, 3));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute("aWarm", new THREE.Float32BufferAttribute(warm, 1));
  g.computeBoundingSphere();
  return g;
}

interface CityProps {
  events: EventInfo[];
  onEnter: (event: EventInfo) => void;
}

export function City({ events, onEnter }: CityProps) {
  const beacons = useMemo(() => events.map((_, i) => beaconSlot(i)), [events]);
  const quality = useDirector((s) => s.quality);
  const data = useMemo(() => buildCity(BEACON_SLOTS, quality === "high" ? 1 : 0.5), [quality]);
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
      uRed: { value: new THREE.Color("#ff4a3d") },
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
  const mass = useMemo(() => makeMassMaterial(), []);
  useEffect(() => () => mass.dispose(), [mass]);

  const sky = useShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(CITY_NIGHT.zenith) },
      uHorizon: { value: new THREE.Color(CITY_NIGHT.horizon) },
      uGlow: { value: new THREE.Color(CITY_NIGHT.glow) },
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
      <hemisphereLight args={["#3a4870", "#0a0c14", 1.05]} />
      {/* the moon: a cool key from behind and to the left, so roofs and far walls separate from the haze */}
      <directionalLight position={[-220, 260, -160]} color={CITY_NIGHT.moon} intensity={1.8} />
      {/* the city's own glow bounced back: a low warm fill from the south-east so the faces toward the
          camera's usual side never fall to black */}
      <directionalLight position={[160, 90, 260]} color="#6b5b4e" intensity={1.2} />
      <Streets />
      <Buildings buildings={data.buildings} startedAt={started} material={mass} />
      <Skyline towers={data.skyline} material={mass} />
      <points geometry={geometry} material={material} frustumCulled={false} />
      {/* ground plane catches the hemisphere light faintly and hides the horizon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <planeGeometry args={[6000, 6000]} />
        <meshBasicMaterial color="#0b0d16" />
      </mesh>
      {events.map((event, i) => (
        <Beacon
          key={event.address}
          event={event}
          position={beacons[i] ?? [0, 0]}
          onEnter={onEnter}
          points={material}
          detail={quality === "high" ? 1 : 0.5}
        />
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
        color="#5a3d24"
        transparent
        opacity={0.5}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/** Dark building masses the windows sit on; they rise out of the ground during the reveal. */
function Buildings({
  buildings,
  startedAt,
  material,
}: {
  buildings: Building[];
  startedAt: RefObject<number>;
  material: THREE.Material;
}) {
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
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, buildings.length]}
      material={material}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/** The far towers: placed once, they sit in the haze before downtown has risen. */
function Skyline({ towers, material }: { towers: Building[]; material: THREE.Material }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    towers.forEach((t, i) => {
      tmpObject.position.set(t.x, t.h / 2, t.z);
      tmpObject.scale.set(t.w, t.h, t.d);
      tmpObject.updateMatrix();
      m.setMatrixAt(i, tmpObject.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [towers]);
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, towers.length]}
      material={material}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/** Heights the name chip may sit at above the ring, lowest first; it climbs the column to clear page copy. */
const CHIP_HEIGHTS = [12, 24, 38, 54, 72] as const;
const CHIP_HOME: number = CHIP_HEIGHTS[0];
const tmpVec = new THREE.Vector3();

function Beacon({
  event,
  position,
  onEnter,
  points,
  detail,
}: {
  event: EventInfo;
  position: [number, number];
  onEnter: (event: EventInfo) => void;
  /** The city's point material, so the plaza resolves and dims with the rest of the lights. */
  points: THREE.ShaderMaterial;
  detail: number;
}) {
  const glow = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
  const material = useShaderMaterial({ ...beaconShader, ...glow, side: THREE.DoubleSide });
  const halo = useShaderMaterial({ ...haloShader, ...glow, side: THREE.DoubleSide });
  const pool = useShaderMaterial({ ...poolShader, ...glow });
  const hovered = useDirector((s) => s.hoveredBeacon === event.address);
  const diving = useDirector(
    (s) =>
      s.transition?.kind === "dive" &&
      s.transition.eventAddress.toLowerCase() === event.address.toLowerCase(),
  );
  const hover = useDirector((s) => s.hoverBeacon);
  const ring = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const chip = useRef<HTMLDivElement>(null);
  const [x, z] = position;
  const plaza = useMemo(() => plazaGeometry([x, z], detail), [x, z, detail]);
  useEffect(() => () => plaza.dispose(), [plaza]);
  // The halo plane stands on the ground (y 0 → 64); its shader turns it toward the camera.
  const haloGeometry = useMemo(() => new THREE.PlaneGeometry(18, 64).translate(0, 32, 0), []);
  useEffect(() => () => haloGeometry.dispose(), [haloGeometry]);
  const leader = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ]);
    const m = new THREE.LineBasicMaterial({
      color: "#ffb457",
      transparent: true,
      opacity: 0.5,
      toneMapped: false,
      depthWrite: false,
    });
    const line = new THREE.Line(g, m);
    line.position.y = 1;
    line.scale.y = CHIP_HOME - 2.2;
    return line;
  }, []);
  useEffect(
    () => () => {
      leader.geometry.dispose();
      (leader.material as THREE.Material).dispose();
    },
    [leader],
  );
  const label = useRef<THREE.Group>(null);
  // Rough on-screen extent of the chip, for the keep-out test (mono 11px + padding + dot).
  const chipHalfWidth = Math.min(160, 24 + event.name.length * 3.4);
  const animated = useMemo(() => [material.uniforms, halo.uniforms, pool.uniforms], [material, halo, pool]);
  useFrame(({ clock, camera, size }) => {
    const t = clock.getElapsedTime();
    const lit = hovered || diving;
    const level = diving ? 1.6 : lit ? 1 : 0;
    for (const u of animated) {
      const time = u["uTime"];
      if (time) time.value = t;
      const boost = u["uBoost"];
      if (boost) boost.value = THREE.MathUtils.lerp(boost.value as number, level, 0.12);
    }
    if (ring.current) {
      const s = 1 + 0.08 * Math.sin(t * 2.2);
      ring.current.scale.setScalar(s * (lit ? 1.25 : 1));
    }
    if (light.current) {
      light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, lit ? 70 : 34, 0.1);
    }
    // The chip climbs the column to stay clear of the page's copy (the hero, the bill on a phone) and hides
    // if no height clears it or the point is behind the camera; the leader line follows. The canvas fills
    // the viewport, so canvas and client coordinates agree.
    const el = chip.current;
    const anchor = label.current;
    if (!el || !anchor) return;
    const rects = keepOutRects();
    let height = -1;
    // in flight the chips are off until the landing: the story's copy speaks for the city there
    const flying = flightPose.inFlight && flightPose.u < LABELS_FROM;
    for (const h of flying ? [] : CHIP_HEIGHTS) {
      tmpVec.set(x, h, z).project(camera);
      if (tmpVec.z > 1) break;
      const sx = (tmpVec.x * 0.5 + 0.5) * size.width;
      const sy = (-tmpVec.y * 0.5 + 0.5) * size.height;
      // off the sides of a narrow screen, or up in the top bar: no height helps, stop looking
      if (sx - chipHalfWidth < 8 || sx + chipHalfWidth > size.width - 8) break;
      if (sy - 13 < 64) break;
      // below the bottom edge: a higher rung may still be on screen
      if (sy + 13 > size.height - 8) continue;
      let clear = true;
      for (const r of rects) {
        if (
          sx + chipHalfWidth > r.left - 6 &&
          sx - chipHalfWidth < r.right + 6 &&
          sy + 13 > r.top - 6 &&
          sy - 13 < r.bottom + 6
        ) {
          clear = false;
          break;
        }
      }
      if (clear) {
        height = h;
        break;
      }
    }
    const hidden = height < 0;
    const visibility = hidden ? "hidden" : "visible";
    if (el.style.visibility !== visibility) el.style.visibility = visibility;
    leader.visible = !hidden;
    if (!hidden) {
      anchor.position.y = THREE.MathUtils.damp(anchor.position.y, height, 8, 1 / 60);
      leader.scale.y = Math.max(0.1, anchor.position.y - 2.2);
    }
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 45, 0]} material={material}>
        <cylinderGeometry args={[1.4, 2.2, 90, 24, 1, true]} />
      </mesh>
      <mesh geometry={haloGeometry} material={halo} frustumCulled={false} />
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={pool}>
        <circleGeometry args={[20, 48]} />
      </mesh>
      <points geometry={plaza} material={points} frustumCulled={false} />
      <primitive object={leader} />
      <pointLight ref={light} position={[0, 6, 0]} intensity={34} distance={70} color="#ffb457" decay={1.5} />
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
      <group ref={label} position={[0, CHIP_HOME, 0]}>
        <Html center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div
            ref={chip}
            className={`chip mono whitespace-nowrap transition-opacity ${hovered ? "opacity-100" : "opacity-70"}`}
          >
            <span className="dot" />
            {event.name}
          </div>
        </Html>
      </group>
    </group>
  );
}
