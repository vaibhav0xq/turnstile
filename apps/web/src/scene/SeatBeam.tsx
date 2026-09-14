import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SeatSpec } from "../venues/layout";
import { useShaderMaterial } from "./materials";

/**
 * The followspot that finds a seat once the chain says its holder is inside: a soft additive cone from the
 * rig down onto the seat, a ring that rolls out across the floor, and a little real light so the seat and
 * its neighbours pick up the colour. It is the frame the whole demo ends on.
 */
export function SeatBeam({ seat, color, footprint }: { seat: SeatSpec; color: string; footprint: number }) {
  const HEIGHT = 7.5;
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
  // Geometry/material handed to meshes as props are not R3F children, so they are released by hand.
  useEffect(() => () => beam.dispose(), [beam]);
  useEffect(() => () => ring.dispose(), [ring]);
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial]);
  const ringRef = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const born = useRef(performance.now());

  useFrame(() => {
    const t = (performance.now() - born.current) / 1000;
    // The beam fades up over the first second and a half so the cut to it is not a flash.
    const reveal = THREE.MathUtils.smoothstep(t, 0.1, 1.6);
    const u = material.uniforms;
    if (u["uTime"]) u["uTime"].value = t;
    if (u["uReveal"]) u["uReveal"].value = reveal;
    const phase = (t % 2.4) / 2.4;
    const r = ringRef.current;
    if (r) {
      r.scale.setScalar(1 + phase * 3.2);
      ringMaterial.opacity = (1 - phase) ** 2 * 0.55 * reveal;
    }
    if (light.current) light.current.intensity = (2.6 + Math.sin(t * 2.1) * 0.3) * reveal;
  });

  return (
    <group position={[seat.x, seat.y, seat.z]}>
      <mesh geometry={beam} material={material} position={[0, HEIGHT / 2 + 0.02, 0]} renderOrder={5} />
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
