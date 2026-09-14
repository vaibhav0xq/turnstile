import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mulberry } from "../lib/random";
import type { SeatSpec } from "../venues/layout";
import { useDirector } from "./director";
import { useShaderMaterial } from "./materials";

const HEIGHT = 7.5;
const DUST = 140;
/** The beat: house lights go down for this long, then the followspot snaps on. */
const HOLD = 0.4;

/**
 * The followspot that finds a seat once the chain says its holder is inside: a soft additive cone from the
 * rig down onto the seat, dust drifting in the beam, a ring that rolls out across the floor, and a little
 * real light so the seat and its neighbours pick up the colour. It is the frame the whole demo ends on.
 *
 * Sitting in the seat ("View from here", the ticket page) the camera is inside the cone; the volume fades
 * out within a few metres of the axis so the view is a lit seat, not a green fog, and the floor pool and
 * the light on the neighbours carry the effect.
 */
export function SeatBeam({ seat, color, footprint }: { seat: SeatSpec; color: string; footprint: number }) {
  const beam = useMemo(
    () => new THREE.CylinderGeometry(0.16, footprint * 1.9, HEIGHT, 40, 1, true),
    [footprint],
  );
  const ring = useMemo(() => new THREE.RingGeometry(footprint * 0.92, footprint * 1.12, 56), [footprint]);
  const material = useShaderMaterial({
    ...followspotShader,
    uniforms: { ...followspotShader.uniforms, uColor: { value: new THREE.Color(color) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [color],
  );
  // Dust: points seeded through the cone volume, each with its own drift phase.
  const dust = useMemo(() => {
    const rnd = mulberry(seat.id + 7);
    const pos = new Float32Array(DUST * 3);
    const phase = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      const h = rnd() * HEIGHT;
      const r = (footprint * 1.9 * (1 - h / HEIGHT) + 0.16 * (h / HEIGHT)) * Math.sqrt(rnd());
      const a = rnd() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = Math.sin(a) * r;
      phase[i] = rnd() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geometry: g, phase };
  }, [seat.id, footprint]);
  const dustMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color,
        size: 0.06,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [color],
  );
  // Geometry/material handed to meshes as props are not R3F children, so they are released by hand.
  useEffect(() => () => beam.dispose(), [beam]);
  useEffect(() => () => ring.dispose(), [ring]);
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial]);
  useEffect(() => () => dust.geometry.dispose(), [dust]);
  useEffect(() => () => dustMaterial.dispose(), [dustMaterial]);
  // The house follows the followspot: lights down while it is on, back up when it goes.
  useEffect(() => {
    const { setLit } = useDirector.getState();
    setLit(true);
    return () => setLit(false);
  }, []);
  const ringRef = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const born = useRef(performance.now());
  const inside = useRef(0);

  useFrame(({ camera }, delta) => {
    const t = (performance.now() - born.current) / 1000;
    // House down first, then the spot snaps on (a quarter second, not a fade-in).
    const reveal = THREE.MathUtils.smoothstep(t, HOLD, HOLD + 0.3);
    // Camera within a few metres of the axis and under the rig: fade the volume out.
    const axisDist = Math.hypot(camera.position.x - seat.x, camera.position.z - seat.z);
    const under = camera.position.y < seat.y + HEIGHT;
    const want = under ? 1 - THREE.MathUtils.smoothstep(axisDist, 1.2, 4) : 0;
    inside.current = THREE.MathUtils.damp(inside.current, want, 6, delta);
    const volume = reveal * (1 - inside.current);
    const u = material.uniforms;
    if (u["uTime"]) u["uTime"].value = t;
    if (u["uReveal"]) u["uReveal"].value = volume;
    dustMaterial.opacity = 0.5 * volume;
    const phase = ((t - HOLD) % 2.4) / 2.4;
    const r = ringRef.current;
    if (r) {
      r.scale.setScalar(1 + Math.max(0, phase) * 3.2);
      ringMaterial.opacity = (1 - Math.max(0, phase)) ** 2 * 0.55 * reveal;
    }
    // In the seat the point light stays (it is what lights the neighbours) but not at full strength,
    // or the floor under the camera saturates.
    if (light.current) {
      light.current.intensity = (2.6 + Math.sin(t * 2.1) * 0.3) * reveal * (1 - inside.current * 0.6);
    }
    // Dust drifts up through the beam and swirls a little; points that leave the top re-enter low.
    const attr = dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < DUST; i++) {
      const p = dust.phase[i] ?? 0;
      let y = (arr[i * 3 + 1] ?? 0) + delta * (0.12 + 0.08 * Math.sin(p));
      if (y > HEIGHT) y -= HEIGHT;
      arr[i * 3 + 1] = y;
      const spread = footprint * 1.9 * (1 - y / HEIGHT) + 0.16 * (y / HEIGHT);
      const a = p + t * 0.35;
      const rad = spread * (0.35 + 0.55 * Math.abs(Math.sin(p * 3.1)));
      arr[i * 3] = Math.cos(a) * rad;
      arr[i * 3 + 2] = Math.sin(a) * rad;
    }
    attr.needsUpdate = true;
  });

  return (
    <group position={[seat.x, seat.y, seat.z]}>
      <mesh geometry={beam} material={material} position={[0, HEIGHT / 2 + 0.02, 0]} renderOrder={5} />
      <points geometry={dust.geometry} material={dustMaterial} renderOrder={6} frustumCulled={false} />
      <mesh
        ref={ringRef}
        geometry={ring}
        material={ringMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        renderOrder={5}
      />
      <pointLight ref={light} color={color} intensity={0} distance={6} decay={2} position={[0, 1.6, 0]} />
    </group>
  );
}

/** Cone of light: strongest where it lands, soft at the silhouette, with a slow haze drifting through it. */
const followspotShader = {
  uniforms: {
    uColor: { value: new THREE.Color("#59f2a1") },
    uTime: { value: 0 },
    uReveal: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    void main() {
      vUv = uv;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - world.xyz);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uReveal;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    void main() {
      // uv.y is 1 at the rig and 0 on the floor.
      float facing = abs(dot(normalize(vNormalW), normalize(vViewDir)));
      float body = pow(facing, 1.4);
      float fall = mix(0.22, 1.0, pow(1.0 - vUv.y, 1.6));
      float top = 1.0 - smoothstep(0.86, 1.0, vUv.y);
      float haze = 0.85 + 0.15 * sin(vUv.y * 14.0 - uTime * 1.3 + sin(vUv.x * 6.2832 + uTime * 0.7) * 1.5);
      float a = body * fall * top * haze * 0.42 * uReveal;
      gl_FragColor = vec4(uColor * 1.35, a);
    }
  `,
};
