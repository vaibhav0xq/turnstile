import { Environment, Lightformer, Sparkles, SpotLight } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SeatMap } from "../chain/seats";
import type { VenueLayout } from "../venues/layout";
import { Decks } from "./Decks";
import { houseLevel, useDirector } from "./director";
import { curtainShader, hazeShader, ledWallShader, useShaderMaterial } from "./materials";
import { Seats } from "./Seats";

interface VenueProps {
  layout: VenueLayout;
  seatMap: SeatMap | undefined;
  interactive: boolean;
}

export function Venue({ layout, seatMap, interactive }: VenueProps) {
  const quality = useDirector((s) => s.quality);
  return (
    <group>
      <Room layout={layout} />
      <Stage layout={layout} />
      {layout.kind === "theatre" ? <Proscenium layout={layout} /> : <LedWall layout={layout} />}
      {layout.kind === "club" ? (
        <>
          <Mezzanine layout={layout} />
          <BoothLights layout={layout} />
          <Haze layout={layout} visible={quality !== "min"} />
        </>
      ) : null}
      <Decks layout={layout} lips={layout.kind !== "club"} />
      <Rig layout={layout} volumetric={quality === "high"} />
      {/* Sparkles and the volumetric cones stay mounted at every tier and are hidden instead: mounting
          them later compiles new shader programs mid-session, and that stall shows as a black frame. */}
      <Seats layout={layout} seatMap={seatMap} interactive={interactive} />
      <group visible={quality === "high"}>
        <Sparkles
          count={260}
          scale={[layout.radius * 1.4, 12, layout.radius * 1.4]}
          position={[0, 5, -2]}
          size={1.6}
          speed={0.25}
          opacity={0.32}
          color="#ffd9a3"
        />
      </group>
      <Environment resolution={64} frames={1}>
        <Lightformer
          form="rect"
          intensity={1.1}
          color="#ffd2a1"
          position={[0, 10, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[30, 30, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.7}
          color="#9fe8ff"
          position={[0, 5, layout.stage.z - 3]}
          scale={[16, 7, 1]}
        />
        <Lightformer form="ring" intensity={0.4} color="#ffb457" position={[0, 3, 12]} scale={[6, 6, 1]} />
      </Environment>
    </group>
  );
}

/** Light intensities that follow the house level (down while a followspot is on). */
function useHouseLights(base: number[]) {
  const refs = useRef<Array<THREE.Light | null>>([]);
  useFrame(() => {
    const level = houseLevel();
    refs.current.forEach((light, i) => {
      if (light) light.intensity = (base[i] ?? 0) * level;
    });
  });
  return (i: number) => (el: THREE.Light | null) => {
    refs.current[i] = el;
  };
}

function Room({ layout }: { layout: VenueLayout }) {
  const r = layout.radius;
  const house = useHouseLights([0.12, 0.22]);
  const strips = useMemo(() => {
    const n = layout.kind === "theatre" ? 18 : 28;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: Math.sin(a) * (r - 0.4), z: Math.cos(a) * (r - 0.4), rotY: a };
    });
  }, [layout.kind, r]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[r, 96]} />
        <meshStandardMaterial color="#08090c" roughness={0.5} metalness={0.4} envMapIntensity={0.35} />
      </mesh>
      <mesh position={[0, 9, 0]}>
        <cylinderGeometry args={[r, r, 18, 96, 1, true]} />
        <meshStandardMaterial color="#0b0c11" roughness={0.9} metalness={0.05} side={THREE.BackSide} />
      </mesh>
      {strips.map((s, i) => (
        <mesh key={i} position={[s.x, 4.2, s.z]} rotation={[0, s.rotY, 0]}>
          <boxGeometry args={[0.05, 8.4, 0.05]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#ffb457" : "#7ee7ff"}
            toneMapped={false}
            transparent
            opacity={0.4}
          />
        </mesh>
      ))}
      <ambientLight ref={house(0)} intensity={0.12} color="#ffe6c7" />
      <hemisphereLight ref={house(1)} intensity={0.22} color="#ffd9b0" groundColor="#05060a" />
    </group>
  );
}

function Stage({ layout }: { layout: VenueLayout }) {
  const { z, width, depth, height } = layout.stage;
  const house = useHouseLights([12]);
  return (
    <group position={[0, 0, z - depth / 2]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#0e0f14" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, height + 0.01, depth / 2 - 0.03]}>
        <boxGeometry args={[width, 0.04, 0.05]} />
        <meshBasicMaterial color="#ffb457" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.02, depth / 2 + 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 2, 0.06]} />
        <meshBasicMaterial color="#ffb457" toneMapped={false} transparent opacity={0.35} />
      </mesh>
      <pointLight
        ref={house(0)}
        position={[0, height + 2.5, 0]}
        intensity={12}
        distance={22}
        color="#ffc98a"
        decay={1.6}
      />
    </group>
  );
}

function LedWall({ layout }: { layout: VenueLayout }) {
  const light = useRef<THREE.PointLight>(null);
  const material = useShaderMaterial({ ...ledWallShader, toneMapped: false });
  const uniforms = material.uniforms;
  const baseIntensity = useRef<number | null>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const level = houseLevel();
    const time = uniforms["uTime"];
    if (time) time.value = t;
    // The wall dims with the house too (to a third, not out: it is the room's colour).
    const intensity = uniforms["uIntensity"];
    if (intensity) {
      baseIntensity.current ??= intensity.value as number;
      intensity.value = baseIntensity.current * (0.35 + 0.65 * level);
    }
    if (light.current) {
      const c = light.current.color;
      c.setHSL((0.06 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.13))) % 1, 0.7, 0.62);
      light.current.intensity = (6 + 2 * Math.sin(t * 0.9)) * level;
    }
  });
  const { z, width, depth, height } = layout.stage;
  return (
    <group position={[0, 0, z - depth + 0.2]}>
      <mesh position={[0, height + 3.6, 0]} material={material}>
        <planeGeometry args={[width - 0.5, 7]} />
      </mesh>
      <mesh position={[0, height + 3.6, -0.06]}>
        <planeGeometry args={[width + 0.4, 7.8]} />
        <meshStandardMaterial color="#0a0a0d" roughness={0.9} />
      </mesh>
      <pointLight
        ref={light}
        position={[0, height + 3, 2.5]}
        intensity={6}
        distance={26}
        decay={1.7}
        color="#ff8a3d"
      />
    </group>
  );
}

function Proscenium({ layout }: { layout: VenueLayout }) {
  const material = useShaderMaterial(curtainShader);
  const house = useHouseLights([10, 5, 5]);
  useFrame(({ clock }) => {
    const time = material.uniforms["uTime"];
    if (time) time.value = clock.getElapsedTime();
  });
  const { z, width, depth, height } = layout.stage;
  const archH = 10.5;
  const gold = "#8a6a34";
  return (
    <group position={[0, 0, z - depth / 2]}>
      {/* curtain */}
      <mesh position={[0, height + archH / 2 - 0.4, -depth / 2 + 0.6]} material={material}>
        <planeGeometry args={[width - 1.2, archH - 0.8, 96, 1]} />
      </mesh>
      {/* pillars + header */}
      <mesh position={[-width / 2 - 0.6, archH / 2, depth / 2 + 0.3]}>
        <boxGeometry args={[1.2, archH, 1.2]} />
        <meshStandardMaterial color={gold} roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[width / 2 + 0.6, archH / 2, depth / 2 + 0.3]}>
        <boxGeometry args={[1.2, archH, 1.2]} />
        <meshStandardMaterial color={gold} roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, archH + 0.6, depth / 2 + 0.3]}>
        <boxGeometry args={[width + 2.4, 1.2, 1.2]} />
        <meshStandardMaterial color={gold} roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, archH - 0.02, depth / 2 + 0.92]}>
        <boxGeometry args={[width + 1.6, 0.05, 0.05]} />
        <meshBasicMaterial color="#ffd9a3" toneMapped={false} />
      </mesh>
      {/* footlights */}
      <pointLight
        ref={house(0)}
        position={[0, height + 1.2, depth / 2 - 1.2]}
        intensity={10}
        distance={16}
        color="#ffc98a"
        decay={1.8}
      />
      <pointLight
        ref={house(1)}
        position={[-4, height + 4, -1]}
        intensity={5}
        distance={14}
        color="#ff9d6b"
        decay={1.8}
      />
      <pointLight
        ref={house(2)}
        position={[4, height + 4, -1]}
        intensity={5}
        distance={14}
        color="#ffd9a3"
        decay={1.8}
      />
    </group>
  );
}

/** Club: the raised mezzanine that carries the booths, with an edge-lit lip. */
const MEZZ_INNER = 19.6;
const MEZZ_THETA = (150 * Math.PI) / 180;
// Cylinder convention (x = r·sinθ, z = r·cosθ): the slab wraps the back of the room, centred on +z.
const MEZZ_START = -MEZZ_THETA / 2;

function Mezzanine({ layout }: { layout: VenueLayout }) {
  const inner = MEZZ_INNER;
  const theta = MEZZ_THETA;
  const start = MEZZ_START;
  const outer = layout.radius - 0.3;
  // One sealed solid (annular sector, extruded up) instead of an open cylinder + ring: no dark wedge where
  // an unlit back face used to show at the ends. The shape is drawn in XY and rotated flat, which maps
  // its angle φ to θ = φ + π/2.
  const slab = useMemo(() => {
    const a0 = start - Math.PI / 2;
    const a1 = a0 + theta;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, a0, a1, false);
    shape.absarc(0, 0, inner, a1, a0, true);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 2.6, bevelEnabled: false, curveSegments: 72 });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [outer]);
  useEffect(() => () => slab.dispose(), [slab]);
  return (
    <group position={[layout.center.x, 0, layout.center.z]}>
      <mesh geometry={slab}>
        <meshStandardMaterial color="#171a24" emissive="#0b0c13" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, 2.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[inner - 0.02, inner + 0.08, 96, 1, start - Math.PI / 2, theta]} />
        <meshBasicMaterial color="#ffb457" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[inner + 0.05, inner + 0.05, 0.05, 96, 1, true, start, theta]} />
        <meshBasicMaterial
          color="#ff7a9e"
          toneMapped={false}
          side={THREE.DoubleSide}
          transparent
          opacity={0.8}
        />
      </mesh>
      {/* Rail posts at both ends, so the lip and the rail finish on something instead of stopping mid-air. */}
      {[start, start + theta].map((angle) => (
        <group key={angle} position={[(inner + 0.05) * Math.sin(angle), 0, (inner + 0.05) * Math.cos(angle)]}>
          <mesh position={[0, 3.1, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 1.0, 12]} />
            <meshStandardMaterial color="#2a2d3a" roughness={0.4} metalness={0.8} />
          </mesh>
          <mesh position={[0, 3.62, 0]}>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshBasicMaterial color="#ff7a9e" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Club: pendants over the booth arc, a top-down fill so the sofas and tables read as furniture and not as
 * flat colour. Hung from the roof on rods, so the light comes from somewhere.
 */
function BoothLights({ layout }: { layout: VenueLayout }) {
  const house = useHouseLights([16, 16, 16]);
  const r = MEZZ_INNER + 3.6;
  const angles = [-0.82, 0, 0.82];
  return (
    <group position={[layout.center.x, 0, layout.center.z]}>
      {angles.map((a, i) => (
        <group key={a} position={[r * Math.sin(a), 0, r * Math.cos(a)]}>
          <mesh position={[0, 8.6, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 3.2, 8]} />
            <meshStandardMaterial color="#2a2d3a" roughness={0.4} metalness={0.8} />
          </mesh>
          <mesh position={[0, 6.9, 0]}>
            <coneGeometry args={[0.42, 0.5, 20, 1, true]} />
            <meshStandardMaterial color="#1c1e27" roughness={0.5} metalness={0.7} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 6.66, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.36, 20]} />
            <meshBasicMaterial color="#ffe2b8" toneMapped={false} />
          </mesh>
          <pointLight
            ref={house(i)}
            position={[0, 6.5, 0]}
            intensity={16}
            distance={13}
            decay={1.7}
            color="#ffdcb0"
          />
        </group>
      ))}
    </group>
  );
}

/** Club: two sheets of low haze over the floor, lit by the wall's colours, drifting slowly. */
function Haze({ layout, visible }: { layout: VenueLayout; visible: boolean }) {
  const glow = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
  const low = useShaderMaterial({ ...hazeShader, ...glow, side: THREE.DoubleSide });
  const high = useShaderMaterial({ ...hazeShader, ...glow, side: THREE.DoubleSide });
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const level = 0.5 + 0.5 * houseLevel();
    const lowTime = low.uniforms["uTime"];
    if (lowTime) lowTime.value = t;
    const highTime = high.uniforms["uTime"];
    if (highTime) highTime.value = t + 37;
    const lowOpacity = low.uniforms["uOpacity"];
    if (lowOpacity) lowOpacity.value = 0.42 * level;
    const highOpacity = high.uniforms["uOpacity"];
    if (highOpacity) highOpacity.value = 0.22 * level;
  });
  useEffect(() => {
    for (const m of [low, high]) {
      const radius = m.uniforms["uRadius"];
      if (radius) radius.value = layout.radius;
    }
  }, [low, high, layout.radius]);
  const size = layout.radius * 2;
  // The room's floor and wall are centred on the origin, and so is the shader's edge fade.
  return (
    <group visible={visible}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.0, 0]} material={low} frustumCulled={false}>
        <planeGeometry args={[size, size]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 2.1, 0]} material={high} frustumCulled={false}>
        <planeGeometry args={[size, size]} />
      </mesh>
    </group>
  );
}

/** Truss with three moving heads over the stage. */
function Rig({ layout, volumetric }: { layout: VenueLayout; volumetric: boolean }) {
  const targets = useMemo(() => [new THREE.Object3D(), new THREE.Object3D(), new THREE.Object3D()], []);
  const { z, height, width } = layout.stage;
  const lights = useRef<Array<THREE.SpotLight | null>>([]);
  useEffect(() => {
    targets.forEach((t, i) => {
      t.position.set((i - 1) * 3.2, height, z - 1.5);
    });
  }, [targets, height, z]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    targets.forEach((o, i) => {
      o.position.x = (i - 1) * 3.4 + Math.sin(t * 0.35 + i * 2.1) * 2.6;
      o.position.z = z - 1.5 + Math.cos(t * 0.28 + i * 1.3) * 1.8;
      const l = lights.current[i];
      if (!l) return;
      l.target = o;
      // The cone mesh is the spotlight's child; hide it below the high tier rather than unmount it.
      for (const child of l.children) child.visible = volumetric;
    });
  });
  const colors = ["#ffb457", "#7ee7ff", "#ff7a9e"];
  const y = layout.kind === "theatre" ? 11.5 : 9;
  return (
    <group>
      <mesh position={[0, y, z - 1]}>
        <boxGeometry args={[width + 2, 0.18, 0.18]} />
        <meshStandardMaterial color="#1a1b20" roughness={0.5} metalness={0.8} />
      </mesh>
      {targets.map((t, i) => (
        <group key={i}>
          <primitive object={t} />
          <SpotLight
            ref={(el: THREE.SpotLight | null) => {
              lights.current[i] = el;
            }}
            position={[(i - 1) * 4.5, y - 0.2, z - 1]}
            color={colors[i] ?? "#ffffff"}
            intensity={volumetric ? 40 : 30}
            distance={26}
            angle={0.3}
            penumbra={0.6}
            decay={1.4}
            attenuation={14}
            anglePower={5}
            opacity={0.22}
            volumetric
          />
        </group>
      ))}
    </group>
  );
}
