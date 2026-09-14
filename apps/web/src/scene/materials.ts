import { useEffect, useState } from "react";
import * as THREE from "three";

/**
 * MeshStandardMaterial with a per-instance emissive colour (`aGlow`, vec3). Instance colour keeps tinting the
 * diffuse as usual; glow is added to the emissive term so bloom can pick individual seats out of the dark.
 */
export function makeGlowMaterial(
  params: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.55,
    metalness: 0.25,
    ...params,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 aGlow;
        varying vec3 vGlow;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vGlow = aGlow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vGlow;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vGlow;`,
      );
  };
  material.customProgramCacheKey = () => "turnstile-glow";
  return material;
}

/** The LED wall behind the stage: slow flowing colour fields with a faint pixel grid. */
export const ledWallShader = {
  uniforms: {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color("#ff8a3d") },
    uColorB: { value: new THREE.Color("#7ee7ff") },
    uColorC: { value: new THREE.Color("#b58cff") },
    uIntensity: { value: 0.8 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;
    uniform float uIntensity;
    varying vec2 vUv;

    // Sine-free hash (Hoskins): fract(sin(x) * 43758) breaks down into speckle on low-precision GPUs.
    vec2 hash2(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return -1.0 + 2.0 * fract((p3.xx + p3.yz) * p3.zy);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
        mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
        u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec2(1.7, 9.2);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = vUv;
      float t = uTime * 0.07;
      // Domain-warped flow: two fields pushed through a third give the content shape and contrast, where
      // plain fbm reads as fog.
      vec2 p = uv * vec2(2.4, 1.5);
      vec2 q = vec2(fbm(p + vec2(t, -t * 0.6)), fbm(p + vec2(5.2, 1.3) - vec2(t * 0.5, t * 0.35)));
      float n1 = fbm(p + 1.6 * q + vec2(t * 0.4, 0.0));
      float n2 = fbm(p * 1.7 - 1.2 * q.yx + vec2(3.1, -t * 0.5));
      vec3 col = mix(uColorA, uColorB, smoothstep(-0.2, 0.3, n1));
      col = mix(col, uColorC, smoothstep(0.02, 0.4, n2) * 0.75);
      // hot ridges where the two fields cross: highlights, so the wall has somewhere for the eye to go
      float ridge = smoothstep(0.55, 1.0, 1.0 - abs(n1 - n2) * 3.0);
      col += (uColorA + uColorB) * 0.3 * ridge;
      // slow horizontal bars sweeping the wall
      float bars = 0.5 + 0.5 * sin(uv.y * 26.0 - uTime * 1.2 + n1 * 6.0);
      col *= 0.7 + 0.5 * pow(bars, 3.0);
      // a light bar crossing the wall every twenty-odd seconds
      float sweep = smoothstep(0.05, 0.0, abs(fract(uTime * 0.045) * 1.4 - 0.2 - uv.x));
      col += vec3(0.9, 0.95, 1.0) * sweep * 0.22;
      // LED structure: each cell is a round pixel on a dark tile with its own flicker — and both are
      // filtered by screen size, so a distant wall reads as its mean instead of moiré or shimmer.
      vec2 cell = uv * vec2(96.0, 42.0);
      vec2 w = fwidth(cell);
      float aa = max(w.x, w.y) * 0.75;
      float px = 1.0 - smoothstep(0.3 - aa, 0.4 + aa, length(fract(cell) - 0.5));
      float ledFade = 1.0 - smoothstep(0.3, 0.9, max(w.x, w.y));
      float flicker = hash2(floor(cell) + floor(uTime * 12.0)).x;
      col *= mix(0.94, 0.42 + 0.66 * px, ledFade);
      col *= 1.0 + flicker * 0.07 * ledFade;
      // vignette so the edges read as a wall, not a light source
      float vig = smoothstep(0.0, 0.18, uv.x) * smoothstep(1.0, 0.82, uv.x) * smoothstep(0.0, 0.2, uv.y) * smoothstep(1.0, 0.8, uv.y);
      col *= 0.35 + 0.65 * vig;
      gl_FragColor = vec4(col * uIntensity, 1.0);
    }
  `,
};

/** Theatre curtain: deep velvet with vertical pleats and a slow breath. */
export const curtainShader = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#5a0f1c") },
    uLight: { value: new THREE.Color("#ffb457") },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    varying float vFold;
    void main() {
      vUv = uv;
      float pleat = sin(uv.x * 62.0 + sin(uTime * 0.4 + uv.y * 3.0) * 0.4);
      vFold = pleat;
      vec3 p = position;
      p.z += pleat * 0.14 * (0.4 + 0.6 * uv.y);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uLight;
    varying vec2 vUv;
    varying float vFold;
    void main() {
      float shade = 0.55 + 0.45 * vFold;
      float top = smoothstep(1.0, 0.2, vUv.y);
      vec3 col = uColor * (0.35 + 0.65 * shade) * (0.55 + 0.45 * top);
      col += uLight * 0.08 * pow(max(vFold, 0.0), 6.0) * top;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** A soft additive light column used for the city beacons. */
export const beaconShader = {
  uniforms: {
    uColor: { value: new THREE.Color("#ffb457") },
    uTime: { value: 0 },
    uBoost: { value: 0 },
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
    uniform float uBoost;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    void main() {
      float fresnel = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 1.6);
      float fall = pow(1.0 - vUv.y, 1.8);
      float pulse = 0.85 + 0.15 * sin(uTime * 1.4 + vUv.y * 6.0);
      float a = fall * (0.26 + 0.6 * fresnel) * pulse * (1.0 + uBoost * 1.6);
      gl_FragColor = vec4(uColor * (1.45 + uBoost), a);
    }
  `,
};

/**
 * Owns a ShaderMaterial for the lifetime of a component. R3F ≥ 9.7 copies the `uniforms` prop into the
 * material, so mutating your own uniforms object no longer reaches the GPU; with this hook the material's
 * `uniforms` *is* the object you animate in `useFrame`.
 */
export function useShaderMaterial(params: THREE.ShaderMaterialParameters): THREE.ShaderMaterial {
  const [material] = useState(
    () =>
      new THREE.ShaderMaterial({
        ...params,
        uniforms: THREE.UniformsUtils.clone(params.uniforms ?? {}),
      }),
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}
