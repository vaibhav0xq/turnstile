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

/** The LED wall behind the stage: three authored programmes (flow, type, beat) on a slow wheel, behind a pixel grid. */
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

    // Programme A — flow: domain-warped colour fields. Two fields pushed through a third give the content
    // shape and contrast, where plain fbm reads as fog.
    vec3 flow(vec2 uv) {
      float t = uTime * 0.07;
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
      float sweep = 1.0 - smoothstep(0.0, 0.05, abs(fract(uTime * 0.045) * 1.4 - 0.2 - uv.x));
      col += vec3(0.9, 0.95, 1.0) * sweep * 0.22;
      return col;
    }

    // Programme B — type: rows of block glyphs marching across the wall, like a ticker nobody reads.
    // Each glyph is a 3×5 cell grid of pseudo-random bits with a solid stem so it reads as lettering.
    vec3 type(vec2 uv) {
      const float rows = 4.0;
      float row = floor(uv.y * rows);
      float dir = mod(row, 2.0) * 2.0 - 1.0;
      float speed = 0.05 + 0.02 * row;
      vec2 g = vec2(uv.x * 14.0 + dir * uTime * speed * 14.0, fract(uv.y * rows));
      float glyph = floor(g.x);
      vec2 cell = vec2(fract(g.x) * 4.0, (g.y - 0.2) / 0.6 * 5.0);
      vec2 c = floor(cell);
      float bit = step(0.5, hash2(vec2(glyph * 7.0 + c.x, row * 13.0 + c.y)).x * 0.5 + 0.5);
      bit = max(bit, step(c.x, 0.0)); // stem
      float inside = step(0.0, cell.x) * step(cell.x, 3.0) * step(0.0, cell.y) * step(cell.y, 5.0);
      float gap = step(0.15, fract(cell.x)) * step(0.15, fract(cell.y));
      float on = bit * inside * gap;
      // whole words blink in and out on a slow clock
      float word = floor(glyph / 5.0);
      float blink = smoothstep(0.35, 0.5, hash2(vec2(word, row + floor(uTime * 0.4))).y * 0.5 + 0.5);
      vec3 ink = mix(uColorB, vec3(1.0), 0.35);
      vec3 col = ink * on * (0.9 + 0.4 * blink);
      // a scanline that keeps the wall alive between words
      float scan = 1.0 - smoothstep(0.0, 0.02, abs(fract(uTime * 0.11) - uv.y));
      col += uColorC * 0.25 * scan;
      col += uColorC * 0.06;
      return col;
    }

    // Programme C — beat: rings pumping out from the centre on a 126 bpm clock over a spectrum of bars.
    vec3 beat(vec2 uv) {
      float bpm = 126.0 / 60.0;
      float phase = fract(uTime * bpm);
      float bar = floor(uTime * bpm);
      float kick = pow(1.0 - phase, 3.0);
      vec2 p = (uv - 0.5) * vec2(2.4, 1.0);
      float r = length(p);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 3; i++) {
        float age = phase + float(i);
        float radius = age * 0.55;
        float ring = 1.0 - smoothstep(0.0, 0.06, abs(r - radius));
        col += mix(uColorA, uColorC, float(i) / 2.0) * ring * (1.0 - age / 3.0) * 0.9;
      }
      // spectrum: 24 bars whose heights drift with noise and jump on the beat
      float column = floor(uv.x * 24.0);
      float h = 0.25 + 0.55 * (0.5 + 0.5 * noise(vec2(column * 0.7, uTime * 0.9))) + kick * 0.22;
      float inBar = step(0.1, fract(uv.x * 24.0)) * step(uv.y, h);
      vec3 barCol = mix(uColorB, uColorA, uv.y / max(h, 0.001));
      col += barCol * inBar * 0.55;
      col += uColorB * (0.06 + 0.10 * kick) * (1.0 - r);
      // the bar count in the corner, as a stack of dots
      float dots = step(uv.x, 0.06) * step(0.86, uv.y) * step(fract(uv.x * 100.0), 0.5) * step(floor(uv.x * 100.0), mod(bar, 4.0));
      col += vec3(1.0) * dots * 0.8;
      return col;
    }

    void main() {
      vec2 uv = vUv;
      // Three programmes on a 90 s wheel, 30 s each, 3 s crossfades. Weights sum to one at every instant
      // and every programme is skipped while its weight is zero.
      float cyc = mod(uTime, 90.0);
      float wA = smoothstep(87.0, 90.0, cyc) + (1.0 - smoothstep(27.0, 30.0, cyc));
      float wB = smoothstep(27.0, 30.0, cyc) * (1.0 - smoothstep(57.0, 60.0, cyc));
      float wC = smoothstep(57.0, 60.0, cyc) * (1.0 - smoothstep(87.0, 90.0, cyc));
      vec3 col = vec3(0.0);
      if (wA > 0.0) col += flow(uv) * wA;
      if (wB > 0.0) col += type(uv) * wB;
      if (wC > 0.0) col += beat(uv) * wC;
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
      float vig = smoothstep(0.0, 0.18, uv.x) * (1.0 - smoothstep(0.82, 1.0, uv.x)) * smoothstep(0.0, 0.2, uv.y) * (1.0 - smoothstep(0.8, 1.0, uv.y));
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
      float top = 1.0 - smoothstep(0.2, 1.0, vUv.y);
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
    varying float vNear;
    void main() {
      vUv = uv;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - world.xyz);
      // a thread of light from the plaza itself, where the column would otherwise fill the frame; the
      // skyline's beam from further off
      vec3 foot = (modelMatrix * vec4(0.0, -45.0, 0.0, 1.0)).xyz;
      // (the glow passes are composited in linear light, so a small alpha still reads: keep the floor tiny)
      vNear = mix(0.03, 1.0, smoothstep(30.0, 110.0, distance(cameraPosition.xz, foot.xz)));
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
    varying float vNear;
    void main() {
      // a beam, not a tube: bright down the middle, gone at the silhouette
      float across = abs(dot(normalize(vNormalW), normalize(vViewDir)));
      float core = pow(across, 1.8);
      float fall = pow(1.0 - vUv.y, 1.8);
      float pulse = 0.85 + 0.15 * sin(uTime * 1.4 + vUv.y * 6.0);
      float a = fall * (0.04 + 0.7 * core) * pulse * (1.0 + uBoost * 1.6) * vNear;
      gl_FragColor = vec4(uColor * (1.45 + uBoost), a);
    }
  `,
};

/** Soft glow standing around a beacon: a plane that always turns its face to the camera about the y axis. */
export const haloShader = {
  uniforms: {
    uColor: { value: new THREE.Color("#ffb457") },
    uTime: { value: 0 },
    uBoost: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying float vNear;
    void main() {
      vUv = uv;
      vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 toCam = cameraPosition - centre;
      toCam.y = 0.0;
      float len = length(toCam);
      // a glow this wide belongs to the skyline, not to a frame shot from the plaza
      vNear = smoothstep(25.0, 90.0, len);
      vec3 fwd = len > 1e-3 ? toCam / len : vec3(0.0, 0.0, 1.0);
      vec3 right = vec3(fwd.z, 0.0, -fwd.x);
      vec3 world = centre + right * position.x + vec3(0.0, position.y, 0.0);
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uBoost;
    varying vec2 vUv;
    varying float vNear;
    void main() {
      // wider at the foot, a thread at the top
      float x = abs(vUv.x * 2.0 - 1.0) * (0.75 + 0.9 * vUv.y);
      float core = pow(max(0.0, 1.0 - x), 2.4);
      float tall = pow(1.0 - vUv.y, 1.4);
      float breath = 0.92 + 0.08 * sin(uTime * 1.7 + vUv.y * 4.0);
      float a = core * tall * (0.2 + 0.45 * uBoost) * breath * vNear;
      gl_FragColor = vec4(uColor * 1.15, a);
    }
  `,
};

/** The pool of light a beacon throws on the ground: radial, breathing, brighter under a hovered beacon. */
export const poolShader = {
  uniforms: {
    uColor: { value: new THREE.Color("#ffb457") },
    uTime: { value: 0 },
    uBoost: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uBoost;
    varying vec2 vUv;
    void main() {
      float r = length(vUv - 0.5) * 2.0;
      float a = pow(max(0.0, 1.0 - r), 2.4) * (0.42 + 0.4 * uBoost);
      a *= 0.9 + 0.1 * sin(uTime * 1.3 - r * 7.0);
      gl_FragColor = vec4(uColor * 1.1, a);
    }
  `,
};

/** Low haze hanging over a club floor: a drifting noise sheet that vanishes when seen edge-on. */
export const hazeShader = {
  uniforms: {
    uTime: { value: 0 },
    uRadius: { value: 30 },
    uColorA: { value: new THREE.Color("#6fd6ff") },
    uColorB: { value: new THREE.Color("#ff6aa8") },
    uOpacity: { value: 0.1 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    varying vec3 vNormalW;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uRadius;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uOpacity;
    varying vec3 vWorld;
    varying vec3 vNormalW;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
      return v;
    }
    void main() {
      // slow drift in two directions, so the sheet never reads as a texture sliding one way
      vec2 p = vWorld.xz * 0.045;
      float n = fbm(p + vec2(uTime * 0.020, uTime * 0.012));
      float m = fbm(p * 1.7 - vec2(uTime * 0.014, -uTime * 0.018) + 5.0);
      // patchy: mostly clear floor with a few thicker banks
      float a = pow(smoothstep(0.30, 0.82, n * 0.65 + m * 0.35), 1.3);
      float dist = length(vWorld.xz);
      a *= 1.0 - smoothstep(uRadius - 7.0, uRadius - 0.5, dist);
      // a sheet seen edge-on is a line: fade it out as the view flattens
      vec3 view = normalize(cameraPosition - vWorld);
      a *= smoothstep(0.05, 0.4, abs(dot(view, vNormalW)));
      // additive, non-premultiplied: the colour is scaled by alpha at blend time, so alpha carries the density
      vec3 col = mix(uColorA, uColorB, smoothstep(0.3, 0.7, m)) * 0.8;
      gl_FragColor = vec4(col, a * uOpacity);
      #include <colorspace_fragment>
    }
  `,
};

/** The city's night palette, shared by the sky dome, the fog and the building masses so they meet in one haze. */
export const CITY_NIGHT = {
  zenith: "#070a14",
  /** the same colour as the fog, so the far ground and the sky meet without a band */
  horizon: "#141a2c",
  /** light pollution over downtown: a faint warm lift at the horizon, never a dusk band */
  glow: "#3b2a1a",
  fog: "#141a2c",
  moon: "#7389cf",
  street: "#ff8a3d",
  /** the two window temperatures: homes and hotels warm, offices cool */
  warm: "#ffb46a",
  cool: "#c4d6ff",
} as const;

/** The mass material's live uniforms, for the frame loop (set once the program has compiled). */
export interface MassUniforms {
  uTime: { value: number };
}

/**
 * Building masses. Standard-lit so the moon and the hemisphere shape them, plus what the lights alone cannot
 * give a box city at night: a procedural window grid on every wall (cells in metres from the instance scale,
 * a per-building lit fraction and temperature, offices lit by the floor, homes by the window, a lit lobby band
 * on some ground floors), a warm street uplight on the lower walls, a moon-coloured rim so neighbouring masses
 * separate, and a cool roof tint. Ground haze mixes in with distance, before the fog.
 */
export function makeMassMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    // a real albedo per instance (see `MASS_ALBEDOS`): the lights do the modelling (a near-black colour left
    // every face at the same black, whatever the light), and the night comes from how little light there is
    color: "#ffffff",
    emissive: "#05070d",
    emissiveIntensity: 1,
    roughness: 0.8,
    metalness: 0.05,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms["uTime"] = { value: 0 };
    shader.uniforms["uHaze"] = { value: new THREE.Color(CITY_NIGHT.fog) };
    shader.uniforms["uHazeHeight"] = { value: 30 };
    shader.uniforms["uHazeAmount"] = { value: 0.45 };
    shader.uniforms["uStreet"] = { value: new THREE.Color(CITY_NIGHT.street) };
    shader.uniforms["uStreetHeight"] = { value: 16 };
    shader.uniforms["uStreetAmount"] = { value: 0.16 };
    shader.uniforms["uRim"] = { value: new THREE.Color(CITY_NIGHT.moon) };
    shader.uniforms["uRimAmount"] = { value: 0.3 };
    shader.uniforms["uRoof"] = { value: new THREE.Color("#3a4666") };
    shader.uniforms["uWarm"] = { value: new THREE.Color(CITY_NIGHT.warm) };
    shader.uniforms["uCool"] = { value: new THREE.Color(CITY_NIGHT.cool) };
    shader.uniforms["uGlass"] = { value: new THREE.Color("#1a2236") };
    shader.uniforms["uWindow"] = { value: 1.0 };
    material.userData["uniforms"] = shader.uniforms as unknown as MassUniforms;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vHazeY;
        varying vec3 vLocal;
        flat varying vec3 vLocalN;
        flat varying vec3 vScale;
        flat varying float vSeed;
        float seedHash(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        vLocalN = objectNormal;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vLocal = transformed;
        #ifdef USE_INSTANCING
        vHazeY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
        vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        // one seed per footprint: the tiers of a set-back tower share it, so they share a tenant
        vSeed = seedHash(floor(instanceMatrix[3].xz * 2.0) + 512.0);
        #else
        vHazeY = (modelMatrix * vec4(transformed, 1.0)).y;
        vScale = vec3(1.0);
        vSeed = 0.5;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform vec3 uHaze;
        uniform float uHazeHeight;
        uniform float uHazeAmount;
        uniform vec3 uStreet;
        uniform float uStreetHeight;
        uniform float uStreetAmount;
        uniform vec3 uRim;
        uniform float uRimAmount;
        uniform vec3 uRoof;
        uniform vec3 uWarm;
        uniform vec3 uCool;
        uniform vec3 uGlass;
        uniform float uWindow;
        varying float vHazeY;
        varying vec3 vLocal;
        flat varying vec3 vLocalN;
        flat varying vec3 vScale;
        flat varying float vSeed;
        // integer-friendly hash (no sine: a sine hash turns any last-bit jitter in its input into noise)
        float hash21(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        // anti-aliased window pane inside a cell: 1 on the glass, 0 on the mullions and spandrel
        float pane(vec2 f, vec2 lo, vec2 hi, vec2 aa) {
          vec2 k = smoothstep(lo - aa, lo + aa, f) * (1.0 - smoothstep(hi - aa, hi + aa, f));
          return k.x * k.y;
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        // The window grid. Everything below is in metres on the wall: the box is a unit cube scaled per
        // instance, so local coordinates times the instance scale give the position on the façade.
        float winGlass = 0.0;   // glass coverage (unlit panes darken the wall)
        vec3 winLight = vec3(0.0); // emitted light
        float streetPool = 1.0; // how much of the street lamps' light reaches this bit of wall
        {
          vec3 an = abs(vLocalN);
          bool wall = an.y < 0.5;
          vec2 extent = an.x > 0.5 ? vec2(vScale.z, vScale.y) : vec2(vScale.x, vScale.y);
          if (wall && vScale.y > 5.0 && extent.x > 2.6) {
            vec2 metres = an.x > 0.5 ? vec2(vLocal.z * vScale.z, vLocal.y * vScale.y) : vec2(vLocal.x * vScale.x, vLocal.y * vScale.y);
            metres += extent * 0.5; // origin at the bottom-left corner of the wall
            float seed = floor(vSeed * 4096.0);
            float faceSeed = seed + an.x * 7.0 + step(0.0, vLocalN.x + vLocalN.z) * 3.0;
            // the tenant: offices (cool, lit by the floor, glass walls) more likely the taller the building
            float office = step(0.62 - 0.25 * smoothstep(20.0, 60.0, vScale.y), hash21(vec2(seed, 2.0)));
            float litFraction = mix(0.12, 0.42, hash21(vec2(seed, 1.0)));
            vec3 tint = mix(uWarm, uCool, office);
            vec2 cellSize = vec2(2.4, 3.2);
            vec2 cc = metres / cellSize;
            vec2 aa = fwidth(cc);
            // cells smaller than a pixel or two: the pattern gives way to its own average
            float lod = smoothstep(0.3, 0.9, max(aa.x, aa.y));
            vec2 cell = floor(cc);
            vec2 f = fract(cc);
            // punched windows in the homes, a curtain wall with thin mullions on the offices
            vec2 lo = mix(vec2(0.15, 0.2), vec2(0.05, 0.1), office);
            vec2 hi = mix(vec2(0.85, 0.84), vec2(0.95, 0.9), office);
            float glass = pane(f, lo, hi, aa);
            // margins: a solid corner pier each side and a parapet at the top
            float margin = step(1.0, metres.x) * step(metres.x, extent.x - 1.0) * step(metres.y, extent.y - 1.4);
            float h = hash21(cell + faceSeed);
            float floorH = hash21(vec2(cell.y, faceSeed + 5.0));
            // offices light up floor by floor, homes window by window; a few switch over the evening
            float threshold = litFraction * mix(1.0, 2.4 * floorH, office);
            float epoch = floor(uTime * 0.11 + h * 6.0);
            float flip = step(0.965, hash21(cell + faceSeed + epoch));
            float lit = abs(step(h, threshold) - flip);
            float bright = 0.3 + 0.7 * pow(hash21(cell + faceSeed + 9.0), 1.6);
            // what a lit window shows: a ceiling-lit room, brighter at the top; homes draw a curtain across
            // one side of some windows, offices show the whole bay
            float room = mix(0.55, 1.0, smoothstep(0.0, 1.0, (f.y - lo.y) / (hi.y - lo.y)));
            room = mix(room, 0.85 + 0.15 * room, office);
            float curtainK = step(0.6, hash21(cell + faceSeed + 4.0)) * (1.0 - office);
            float curtainSide = step(0.5, hash21(cell + faceSeed + 6.0)) * 2.0 - 1.0;
            float curtain = mix(1.0, 0.3 + 0.7 * smoothstep(0.35, 0.65, 0.5 + curtainSide * (f.x - 0.5)), curtainK);
            float upper = step(4.4, metres.y);
            float grid = glass * margin * upper;
            // the ground floor: a lit shopfront or lobby band on most buildings (nearly all of the low ones,
            // which line the plazas), a dark base on the rest; a few shops are lit cool white
            float lobbyK = step(mix(0.3, 0.12, step(vScale.y, 14.0)), hash21(vec2(seed, 3.0)));
            float lobby = lobbyK * step(metres.y, 4.2) * step(0.7, metres.y) * step(0.8, metres.x) * step(metres.x, extent.x - 0.8);
            float mullion = 1.0 - smoothstep(0.03, 0.03 + aa.x * 2.0, abs(fract(metres.x / 3.9) - 0.5) - 0.44);
            lobby *= mullion;
            float lobbyBright = 0.22 + 0.3 * hash21(vec2(seed, 4.0));
            vec3 lobbyTint = mix(uWarm, vec3(0.62, 0.68, 0.78), step(0.85, hash21(vec2(seed, 5.0))));
            float avg = 0.36 * litFraction * 0.72;
            winGlass = mix(grid + lobby, 0.36 * upper + lobby, lod);
            winLight = mix(grid * lit * bright * room * curtain, avg * upper, lod) * tint * uWindow + lobby * lobbyTint * lobbyBright;
            // the street lamps stand every 12 m along the kerb: pools of light on the wall between dimmer bays
            float alongLamp = (fract(metres.x / 12.0 + 0.5) - 0.5) * 12.0;
            streetPool = 0.35 + 0.65 * exp(-alongLamp * alongLamp / 9.0);
          }
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, uGlass, winGlass);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += winLight;`,
      )
      .replace(
        "#include <fog_fragment>",
        `{
          vec3 nrm = normalize(vNormal);
          // world up in view space is the view matrix's second column
          float roofK = smoothstep(0.6, 0.95, dot(nrm, viewMatrix[1].xyz));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uRoof, roofK * 0.2);
          float streetK = uStreetAmount * streetPool * (1.0 - smoothstep(0.0, uStreetHeight, vHazeY)) * (1.0 - roofK);
          gl_FragColor.rgb += uStreet * streetK;
          float fres = pow(1.0 - max(dot(nrm, normalize(vViewPosition)), 0.0), 3.0);
          gl_FragColor.rgb += uRim * (uRimAmount * fres);
        }
        // ground haze is a distance effect: a wall next to the lens stays crisp, one across town sinks
        float hazeK = uHazeAmount * (1.0 - smoothstep(0.0, uHazeHeight, vHazeY)) * smoothstep(30.0, 220.0, length(vViewPosition));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, hazeK);
        #include <fog_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "turnstile-mass-8";
  return material;
}

/** Wall albedos a building is dealt by its seed: grey render, warm stone, brick, pale render, dark glass, green-grey. */
const MASS_ALBEDOS: readonly [THREE.Color, ...THREE.Color[]] = [
  new THREE.Color("#5a6070"),
  new THREE.Color("#6b6256"),
  new THREE.Color("#6a4d44"),
  new THREE.Color("#787c84"),
  new THREE.Color("#3e4656"),
  new THREE.Color("#56605c"),
];
/** The albedo for a building's seed (tiers of one tower share the seed, so they share the wall). */
export function massAlbedo(seed: number): THREE.Color {
  const i = Math.min(MASS_ALBEDOS.length - 1, Math.max(0, Math.floor(seed * MASS_ALBEDOS.length)));
  return MASS_ALBEDOS[i] ?? MASS_ALBEDOS[0];
}

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
