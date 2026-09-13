# Subagent result: designA

## Per-site deep dive

### Pryzm — https://pryzm.design/studio
**What it is.** Pryzm is Ava Thiery’s browser-based visual/background studio, not a client-services studio or generic 3D-component shop. Users combine gradient, image and pattern layers, stack GPU effects, animate them, then export stills, seamless video or a live React/Framer/HTML WebGL component.

**Tech detected.** Next.js/Turbopack + React + Tailwind utilities; custom WebGL2/GLSL renderer and `GradientEngine`; Motion runtime; Lenis; Supabase/Sentry/Polar. Evidence includes `canvas.getContext("webgl2")`, shader compilation/uniforms/textures, visibility-aware RAF and live embed rendering in downloaded chunks. Common motion constants include 450ms with `[.4,0,.1,1]`, plus 180/30 springs.

**Layout/type/palette.** Dense desktop editor chrome around a stable central stage; Flow is a zoomable node canvas. Black/near-black neutral shell (`#000`, `#171717`, `#262626`) lets artwork carry color. Inter body, Poppins heading, Geist Mono utility copy; ~48px H1, 36px H2, 11px UI labels; 8px rhythm/radii.

**Motion/3D inventory.** Three-layer compositor; Optics, Light, Waves, Glass distortion, Pixelate, Dither, Halftone, Plaid, ASCII, Grain; drifting fields, rippling waves, shimmering rays/caustics and flickering grain. Flow connects effect outputs to bases by dragging ports. This is GPU procedural depth/optics, not polygonal Three.js 3D. “Scene transitions” are parameter/effect-stack morphs and preset replacement rather than camera flights.

**Best patterns.** (1) Ink Facet—magenta beam through fluted glass; (2) Spectrum Pane—spectral field under ribbed prism glass; (3) Violets—photo + frost + aberration + grain; (4) Stone Glyph—blurred garden remapped to ASCII; (5) Pewter Stock—grainy green photographic haze; (6) live-code export; (7) remixable preset recipes; (8) node-graph composition; (9) stable stage with immediate controls.

**License/install.** Studio needs no install. Free clean PNG is preview-size; free video is watermarked; Pro unlocks up to 4K, longer loops and higher FPS. Personal/commercial use is allowed; standalone-stock resale is not. MP4/H.264, WebM/VP9 and AV1 exports.

**Verdict.** Excellent S+ reference for shader art direction, layered optics and product-as-tool interaction. It is cinematic through light, haze, glass and temporal layering—not real geometric 3D or cinematic page-to-page camera movement.

### FeralUI — https://feralui.dev/gradients
**What it is.** A small gallery/library of playful, physics-driven React experiments plus a free procedural Gradient Builder. It is not one universally installable library: only named npm packages are licensed.

**Tech detected.** Vite-style single bundle, React/Motion runtime, SVG, Canvas 2D and raw WebGL/GLSL depending on experiment. Evidence includes hand-written shader creation/uniforms, RAF, Canvas contexts, `feTurbulence`, displacement, diffuse-lighting and moving `fePointLight`. No Three/R3F core abstraction detected.

**Layout/type/palette.** Dark workshop shell (`#101012`, `#1D1D1F`) with silver/blue-gray (`#E8E8EA`, `#8B98A5`, `#67788A`) and vivid demo-local palettes. Inter/system UI, occasional Caveat accent, 4px rhythm, ~17px panels and pill controls. Curated traditional Japanese color names make outputs feel art-directed.

**Gradient inventory.** Flow/mesh with draggable distance-weighted color spots; animated Sky; serpentine Aurora; rolling stacked Waves; Retro grainy blobs; Pixel breathing quilt/frosted cubes/glossy bobbing orbs; radial haze-light; seam-free mirrored Conic; draggable-stop Linear; Skyline wallpaper; plus Stripes and 20+ types claimed overall. Controls include bands/coverage, warp, wind, speed and grain. Exports are editable named-layer SVG, PNG and MP4; animated exports have multiple quality tiers.

**Best patterns/components.** (1) Hologram—pointer tilt drives real-time SVG bump-map relighting, border glow and canvas particles; (2) Fur—single-canvas strands bend under pointer and spring back, with RAF sleeping after settlement; (3) Jelly Blob—SVG mascot gaze/mood responds to input focus/password/buttons/poking; (4) Aurora ribbon; (5) Wave depth bands; (6) Pixel glass-orb field; (7) Screenery’s signature app-screen entrances; (8) mesh’s draggable color topology.

**License/install.** Gradient generation/export is free, no signup/watermark. MIT npm packages: `pullcord`, `playcaptcha`, `feral-blob`, `feral-fur`, `animaps-react`. Example installs: `npm install feral-blob`, `npm install feral-fur`. Unpublished demos are not licensed to copy/redistribute.

**Verdict.** Strongest reference for tactile, state-aware material interaction. Individual effects are premium because pointer/product state changes the simulated material—not because of basic hover polish. Gradient Builder itself should inspire scene lighting, not generic full-page gradients.

### Jiro Build — https://jiro.build
**What it is.** A design-prompt/component/template library for vibe-coding tools—not a site builder or 3D-template engine. Browse live previews, copy AI-ready implementation prompts, then paste into Bolt/Lovable/v0/Replit/Cursor; Chrome and announced MCP integrations shorten handoff.

**Tech detected.** Next.js/Turbopack + React + Tailwind; Motion/Framer Motion; Lenis; Supabase. Own chunks show 1.2s exponential Lenis smoothing, 300–600ms ease-out reveals, springs and 22s linear marquees. No Three/R3F/custom WebGL renderer detected in Jiro’s shell. Embedded metadata says Whimsy uses GSAP; Jellypo GSAP + Lenis; Video Studio Framer Motion; Luma Framer Motion + Lucide.

**Layout/type/palette.** Light searchable catalogue, category/filter rails, responsive preview cards and full-height iframe previews. White/`#1A1A1A`/gray with purple `#7C3AEC` and lilac accents. Geist + Inter; ~47px H1, 64px H2, 16px body; 12–14px rounded controls.

**Motion/3D inventory.** Jiro’s own site is conventional polished 2D: opacity + 12–32px Y reveals, filtered-grid enter/exit, pulsing SVG diagrams and marquees. Dream World Park/Whimsy is a mouse-follow header over a vibrant pre-rendered 3D fantasy video, not detected live 3D. Jellypo uses a cinematic night landscape; Video & Photography Studio uses full-bleed immersive video/minimal nav; Luma combines product preview/workflow visuals. CryptoCalc is the strongest live-demo structure; Luxterra/Verdant/TechConf are editorial template archetypes.

**Best patterns.** (1) Full-height iframe demo mode; (2) browse→preview→copy workflow; (3) minimal full-bleed video hero; (4) pointer-follow character/world; (5) pulsing signal diagram; (6) CryptoCalc’s functional demo embedded in narrative; (7) dense category taxonomy; (8) sparse chrome around immersive previews.

**License/install.** Prompt/code delivery, not npm. Free tier covers free items/personal work; fetched pricing showed $58 annual, $79 early-bird lifetime and team plans, with premium commercial usage. Campaign-sensitive. MCP advertises Claude Code/Desktop, Codex, Cursor, Lovable, Replit, Bolt, VS Code and any MCP client.

**Verdict.** Good product usability and curation reference, but insufficient as the primary S+ 3D benchmark. Its cinematic examples mostly use video plates and ordinary Motion/GSAP; adapt composition/workflow, not its repeated fade-up card motion.

## Adaptable patterns for our hackathon site

1. **Persistent shader world** → hero through proof chapters → R3F/Three custom `ShaderMaterial`, one Canvas, uniform morphs and camera keyframes → **L**.
2. **Ink Facet portal** → hero/product reveal → dark volumetric beam, ribbed refractive glass, bloom, grain; R3F + postprocessing → **L**.
3. **Flow node narrative** → “how it works” + live demo → React Flow/XYFlow controlling actual scene uniforms/results → **M**.
4. **Pointer-relit result card** → generated output/result → perspective spring + SVG/WebGL normal/height map, specular lobe and edge light → **M**.
5. **Product-state mascot/object** → form/demo input → R3F rig or SVG gaze/mood driven by focus, validation and result states → **M**.
6. **Aurora as transition light** → chapter transition, not background decoration → GLSL SDF ribbon used as light/mask; 1.2–1.8s eased morph → **M/L**.
7. **Pixel-orb data field** → metrics/results → instanced R3F spheres whose wave, color and depth encode real data → **M**.
8. **Tactile settling material** → one key interactive object → Canvas/R3F verlet or spring field; RAF invalidation only while disturbed → **L**.
9. **Cinematic demo mode** → main CTA → collapse landing UI, camera dolly into full-viewport functional demo, preserve scene continuity → **L**.
10. **Pryzm-style recipe states** → use cases/gallery → named scene presets morph shared geometry/materials instead of remounting flat sections → **M**.
11. **Screenery entrance choreography** → in-product screens → depth-staggered panels, occlusion and camera rack-focus; GSAP timeline → **M**.
12. **Reduced-motion scene cuts** → accessibility → deterministic still compositions and crossfades when motion reduction is requested → **S/M**.

## Anti-patterns observed

- Jiro’s repeated opacity/translate card reveals and marquees become template-like quickly; keep them secondary.
- Pre-rendered “3D” video can look cinematic but is not interactive and disconnects from product state.
- Full-page gradient wallpaper without narrative coupling is generic; gradients should act as light, material, mask or data field.
- Static glass/orbs are decoration. Require pointer, scroll, input or real result data to change them.
- Smooth scrolling alone is not cinematic choreography.
- Avoid separate Canvas instances per section; preserve one world/camera for continuity and performance.
- Do not copy unlicensed FeralUI demos; reimplement techniques or use its MIT packages.
- Heavy grain/aberration can reduce text/product clarity; apply in scene layers, not UI chrome.

## Sources

1. Pryzm root — https://pryzm.design/ — `research/sources/designA-01-pryzm-root.md`
2. Pryzm Studio/Docs/Flow — https://pryzm.design/studio, /docs, /flow — `designA-02`, `03`, `05`
3. Pryzm Gallery and recipes — https://pryzm.design/gallery — `designA-04`, `07`, `28`–`34`
4. Pryzm About — https://pryzm.design/about — `designA-06-pryzm-about.md`
5. Feral root/Gradients — https://feralui.dev/, https://feralui.dev/gradients — `designA-08`, `09`
6. Feral gradient detail pages — `/animated-gradient`, `/mesh-gradient`, `/linear-gradient`, `/radial-gradient`, `/aurora-gradient`, `/conic-gradient`, `/gradient-wallpaper`, `/grainy-gradient`, `/pixel-gradient`, `/wave-gradient` — `designA-10`–`13`, `35`–`40`
7. Feral Blob/Fur/Scenes/Hologram — https://feralui.dev/blob, /fur, /scenes, /hologram — `designA-14`, `15`, `41`, `42`
8. Feral Terms — https://feralui.dev/terms — `designA-16-feral-terms.md`
9. Jiro root/Templates/Pricing/MCP — https://jiro.build/, /templates, /pricing, /mcp — `designA-17`–`20`
10. Jiro Luma/Lifetime/Launching — `/components/features/features-02-luma`, `/lifetime-deal`, `/launching` — `designA-22`–`24`
11. Jiro Whimsy/Jellypo/Video Studio — `/components/header/dream-world-park-header-whimsy`, `/jellypo-header-section`, `/video-photography-studio-header` — `designA-43`–`45`
12. Jiro Luxterra/TechConf/Verdant/CryptoCalc — corresponding template URLs — `designA-46`, `48`–`50`
13. Branding captures — three roots — `research/sources/designA-53-pryzm-branding.json`, `54-feral-branding.json`, `55-jiro-branding.json`
14. Direct HTML/bundle evidence — all three sites — `research/sources/designA-56-bundle-tech-evidence.md`

Compact inventories were written to `research/design/pryzm.design.md`, `research/design/feralui.dev.md`, and `research/design/jiro.build.md`.