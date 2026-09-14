import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mulberry } from "../lib/random";
import {
  HALF_BLOCKS,
  PITCH,
  PLAZA_LAMP_X,
  PLAZA_LAMP_Z,
  plazaFrame,
  plazaRect,
  STREET,
  TOWN_EXTENT,
} from "./city-gen";
import { CITY_NIGHT, useShaderMaterial } from "./materials";

/**
 * The ground under the city: asphalt streets on the block grid with kerbs, lane dashes and the pools the
 * street lamps throw, blocks a shade darker between them, and the plain dark plain beyond town. One plane,
 * drawn in the shader from world coordinates, so it costs nothing however close the camera comes.
 */
const groundVertex = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const groundFragment = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uAsphalt;
  uniform vec3 uBlock;
  uniform vec3 uKerb;
  uniform vec3 uLamp;
  uniform vec3 uLane;
  uniform vec3 uPaving;
  uniform float uPitch;
  uniform float uStreetHalf;
  uniform float uExtent;
  // each plaza as (min x, min z, max x, max z), kerb to kerb
  uniform vec4 uPlazas[PLAZAS];
  // and its frame: (slot x, slot z, forward x, forward z), for the lamp posts in plaza-local metres
  uniform vec4 uPlazaFrames[PLAZAS];
  uniform int uPlazaCount;
  uniform float uPlazaLampX;
  uniform vec4 uPlazaLampZ;
  varying vec3 vWorld;
  float gridDist(float v, float pitch) { return abs(fract(v / pitch + 0.5) - 0.5) * pitch; }
  // a lamp pool every 12 m along a street, staggered on the two sides
  float pools(float along, float across) {
    float a = gridDist(along, 24.0);
    float b = gridDist(along + 12.0, 24.0);
    float side = uStreetHalf - 0.3;
    float p = exp(-a * a / 4.5) * exp(-pow(across - side, 2.0) / 3.5)
            + exp(-b * b / 4.5) * exp(-pow(across + side, 2.0) / 3.5);
    return p * step(abs(across), uStreetHalf + 2.0);
  }
  // the pools under a plaza's eight lamp posts, in its local frame
  float plazaPools(vec2 p) {
    float sum = 0.0;
    for (int i = 0; i < PLAZAS; i++) {
      if (i >= uPlazaCount) break;
      vec4 f = uPlazaFrames[i];
      vec2 d = p - f.xy;
      vec2 local = vec2(dot(d, vec2(f.w, -f.z)), dot(d, f.zw));
      float across = abs(local.x) - uPlazaLampX;
      vec4 along = local.y - uPlazaLampZ;
      vec4 e = exp(-along * along / 5.0);
      sum += exp(-across * across / 5.0) * (e.x + e.y + e.z + e.w);
    }
    return sum;
  }
  // signed distance to the nearest plaza rectangle (negative inside)
  float plazaDist(vec2 p) {
    float best = 1e9;
    for (int i = 0; i < PLAZAS; i++) {
      if (i >= uPlazaCount) break;
      vec4 r = uPlazas[i];
      vec2 q = abs(p - (r.xy + r.zw) * 0.5) - (r.zw - r.xy) * 0.5;
      best = min(best, max(q.x, q.y));
    }
    return best;
  }
  void main() {
    vec2 p = vWorld.xz;
    float town = 1.0 - smoothstep(uExtent, uExtent + 40.0, max(abs(p.x), abs(p.y)));
    // signed distance to the nearest street centre line on each axis
    float sx = fract(p.x / uPitch + 0.5) - 0.5;
    float sz = fract(p.y / uPitch + 0.5) - 0.5;
    float dx = abs(sx) * uPitch;
    float dz = abs(sz) * uPitch;
    float d = min(dx, dz);
    float aa = max(fwidth(d), 0.02);
    float street = 1.0 - smoothstep(uStreetHalf - aa, uStreetHalf + aa, d);
    float kerb = 1.0 - smoothstep(0.25, 0.25 + aa, abs(d - uStreetHalf));
    vec3 col = mix(uBlock, uAsphalt, street);
    col = mix(col, uKerb, kerb * 0.7);
    // lane dashes down the middle of each street, 3 m on, 3 m off
    float dashX = step(0.5, fract(p.y / 6.0));
    float dashZ = step(0.5, fract(p.x / 6.0));
    float laneX = (1.0 - smoothstep(0.1, 0.1 + aa, dx)) * dashX;
    float laneZ = (1.0 - smoothstep(0.1, 0.1 + aa, dz)) * dashZ;
    col += uLane * max(laneX, laneZ) * 0.5 * (1.0 - smoothstep(0.02, 0.2, aa));
    // lamp pools: warm on the asphalt, spilling a little onto the pavement
    float lamp = pools(p.y, sx * uPitch) + pools(p.x, sz * uPitch);
    col += uLamp * lamp * 0.22;
    // the plazas: paved over, with a 2 m stone grid and a kerb where they meet the streets
    float pd = plazaDist(p);
    float paa = max(fwidth(pd), 0.02);
    float plaza = 1.0 - smoothstep(-paa, paa, pd);
    vec2 stone = abs(fract(p / 2.0 + 0.5) - 0.5) * 2.0;
    float joint = 1.0 - smoothstep(0.06, 0.06 + aa, min(stone.x, stone.y));
    vec3 paved = uPaving * (1.0 - 0.35 * joint * (1.0 - smoothstep(0.02, 0.15, aa)));
    float plazaKerb = 1.0 - smoothstep(0.3, 0.3 + paa, abs(pd));
    paved = mix(paved, uKerb, plazaKerb * 0.7);
    paved += uLamp * plazaPools(p) * 0.3;
    col = mix(col, paved, plaza);
    col = mix(uBlock * 0.7, col, town);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/**
 * Traffic: streaks of head- and tail-lights sliding along the avenues, wrapping at the edge of town. One
 * instanced quad per streak; the vertex shader moves it, so the CPU never touches it after the build.
 */
const trafficVertex = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec2 aDir;
  attribute vec4 aParams; // phase, speed, length, kind (0 head, 1 tail)
  uniform float uTime;
  uniform float uSpan;
  varying float vAlong;
  varying float vKind;
  varying float vFade;
  void main() {
    float s = mod(aParams.x + aParams.y * uTime, uSpan);
    vec2 perp = vec2(-aDir.y, aDir.x);
    vec2 xz = aOrigin.xz + aDir * (s + position.x * aParams.z) + perp * position.z * 1.1;
    vec4 mv = modelViewMatrix * vec4(xz.x, aOrigin.y, xz.y, 1.0);
    gl_Position = projectionMatrix * mv;
    vAlong = position.x;
    vKind = aParams.w;
    // far streaks dissolve into the haze like the windows do
    vFade = exp(-max(0.0, -mv.z - 160.0) * 0.0024);
  }
`;

const trafficFragment = /* glsl */ `
  uniform vec3 uHead;
  uniform vec3 uTail;
  varying float vAlong;
  varying float vKind;
  varying float vFade;
  void main() {
    // bright at the front of the streak, trailing off behind
    float a = smoothstep(0.0, 0.08, vAlong) * (1.0 - smoothstep(0.25, 1.0, vAlong));
    vec3 col = mix(uHead, uTail, vKind) * 1.4;
    gl_FragColor = vec4(col, a * vFade);
  }
`;

function buildTraffic(
  count: number,
  avoid: ReadonlyArray<readonly [number, number]>,
): THREE.InstancedBufferGeometry {
  const rnd = mulberry(2024);
  const g = new THREE.InstancedBufferGeometry();
  // a unit strip: x along the street (0 → 1), z across (−0.5 → 0.5)
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, -0.5, 1, 0, -0.5, 0, 0, 0.5, 1, 0, 0.5], 3),
  );
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const origin: number[] = [];
  const dir: number[] = [];
  const params: number[] = [];
  // streets that run through a plaza are the pedestrians': every street line strictly inside a plaza's
  // rectangle is closed along its length
  const closedX = new Set<number>();
  const closedZ = new Set<number>();
  for (const slot of avoid) {
    const { min, max } = plazaRect(slot);
    for (let line = -HALF_BLOCKS; line <= HALF_BLOCKS; line++) {
      const c = line * PITCH;
      if (c > min[0] && c < max[0]) closedX.add(line);
      if (c > min[1] && c < max[1]) closedZ.add(line);
    }
  }
  let made = 0;
  while (made < count) {
    const alongX = rnd() < 0.5;
    const line = Math.floor(rnd() * (HALF_BLOCKS * 2 + 1)) - HALF_BLOCKS;
    if ((alongX ? closedZ : closedX).has(line)) continue;
    const sign = rnd() < 0.5 ? -1 : 1;
    // right-hand traffic: the lane sits to the right of the direction of travel
    const lane = sign * 1.4;
    const c = line * PITCH;
    if (alongX) {
      origin.push(-sign * TOWN_EXTENT, 0.9, c - lane);
      dir.push(sign, 0);
    } else {
      origin.push(c + lane, 0.9, -sign * TOWN_EXTENT);
      dir.push(0, sign);
    }
    params.push(rnd() * TOWN_EXTENT * 2, 9 + rnd() * 7, 9 + rnd() * 7, sign > 0 ? 0 : 1);
    made++;
  }
  g.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(new Float32Array(origin), 3));
  g.setAttribute("aDir", new THREE.InstancedBufferAttribute(new Float32Array(dir), 2));
  g.setAttribute("aParams", new THREE.InstancedBufferAttribute(new Float32Array(params), 4));
  g.instanceCount = count;
  return g;
}

/** the shader's fixed plaza slots (one per beacon slot) */
const MAX_PLAZAS = 6;

interface GroundProps {
  /** thins the traffic for the lower tiers */
  detail: number;
  /** intersections closed to traffic (the plazas) */
  plazas: ReadonlyArray<readonly [number, number]>;
}

export function Ground({ detail, plazas }: GroundProps) {
  const ground = useShaderMaterial({
    defines: { PLAZAS: MAX_PLAZAS },
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib["fog"]),
      uAsphalt: { value: new THREE.Color("#10131c") },
      uBlock: { value: new THREE.Color("#0b0d15") },
      uKerb: { value: new THREE.Color("#1c2130") },
      uLamp: { value: new THREE.Color(CITY_NIGHT.street) },
      uLane: { value: new THREE.Color("#8a7a5a") },
      uPaving: { value: new THREE.Color("#171a25") },
      uPitch: { value: PITCH },
      uStreetHalf: { value: STREET / 2 },
      uExtent: { value: TOWN_EXTENT + STREET / 2 },
      uPlazas: {
        value: Array.from({ length: MAX_PLAZAS }, (_, i) => {
          const slot = plazas[i];
          if (!slot) return new THREE.Vector4(1e6, 1e6, 1e6 + 1, 1e6 + 1);
          const { min, max } = plazaRect(slot);
          return new THREE.Vector4(min[0], min[1], max[0], max[1]);
        }),
      },
      uPlazaFrames: {
        value: Array.from({ length: MAX_PLAZAS }, (_, i) => {
          const slot = plazas[i];
          if (!slot) return new THREE.Vector4(1e6, 1e6, 0, 1);
          const { forward } = plazaFrame(slot);
          return new THREE.Vector4(slot[0], slot[1], forward[0], forward[1]);
        }),
      },
      uPlazaLampX: { value: PLAZA_LAMP_X },
      uPlazaLampZ: { value: new THREE.Vector4(...PLAZA_LAMP_Z) },
      uPlazaCount: { value: Math.min(plazas.length, MAX_PLAZAS) },
    },
    vertexShader: groundVertex,
    fragmentShader: groundFragment,
    fog: true,
  });
  const traffic = useShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpan: { value: TOWN_EXTENT * 2 },
      uHead: { value: new THREE.Color("#fff0d2") },
      uTail: { value: new THREE.Color("#ff4a3d") },
    },
    vertexShader: trafficVertex,
    fragmentShader: trafficFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const count = Math.round(320 * detail);
  const streaks = useMemo(() => buildTraffic(count, plazas), [count, plazas]);
  useEffect(() => () => streaks.dispose(), [streaks]);
  useFrame(({ clock }) => {
    const t = traffic.uniforms["uTime"];
    if (t) t.value = clock.getElapsedTime();
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={ground} frustumCulled={false}>
        <planeGeometry args={[6000, 6000]} />
      </mesh>
      <mesh geometry={streaks} material={traffic} frustumCulled={false} />
    </group>
  );
}
