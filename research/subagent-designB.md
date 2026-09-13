# Subagent result: designB

## Per-site deep dive

### Skiper UI
A shadcn-compatible React/Tailwind source library. I recovered **100 current catalog records** (full inventory at `research/sources/designB-14-skiper-full-inventory.tsv`) and deeply inspected 14 pages.

**Tech evidence:** Next.js/RSC, Tailwind 4.1.3; catalog dependencies include Framer Motion, GSAP, Lenis, Three.js, R3F, Swiper, Radix, media-chrome and Canvas. Free install is `npx shadcn add @skiper-ui/[name]`; Pro is TSX download/authenticated registry. Free permits commercial use with attribution; Pro removes attribution. Advertised one-time pricing: $129/$549.

**Full inventory is grouped in `research/design/skiper-ui.com.md`.** Categories/counts include Crazy Hero, Scroll Effects, Out of the box, Crazy Hover, preloaders, carousels, navigation, Minimal interactions, Video, Web3, AI Input, Vercel/Rauno and utilities. Genuine 3D is limited but strong: **Vercel Liquid** (WebGL pointer-ripple shader), **ASCII Simulation** (Three.js GLB + orbit/drag), and **Interactive3d Hero** (R3F pointer-camera/dynamic light). Most other “3D” is polished CSS perspective: Card Stack, perspective carousels, 3D Rolling Text. Best scroll systems are GSAP Card Stack, Image Reveal 71, parallax and Vercel scroll-blur; best cursor systems are Infinite Canvas, image trail and drawing canvas.

Motion quality is strongest when continuously mapped to scroll or spring physics, not timed entrances. Image trail has a 1.5 s lifecycle; Tailwind shell defaults are 150 ms `cubic-bezier(.4,0,.2,1)`. Typography detected: Geist/Geist Mono plus Alphalyrae, Thunder, Old School Grotesk and Plus Jakarta Sans. Quality verdict: **A overall; S for selected hero/scroll pieces**, but many entries remain ordinary DOM microinteractions.

### ThreeUI
Verified: this is the target-scale 3D library. The fetched browse snapshot exposes **465 routes** (`research/sources/designB-07-threeui-full-inventory.tsv`). Large grouped inventory and 18 deep dives are in `research/design/threeui.com.md`.

**Categories:** full landing pages/scroll narratives; heroes; procedural backgrounds; Three.js product/object scenes; WebGL/GLSL shaders; particle/flow fields; typography; buttons; UI elements; CSS/CSS3D; Canvas2D; and authored motion-design films. Notable families include Kage, Orrery, Cortexa, Cathode, Betawise, Tidecrest, Sylva, Aster Halftone, Advanced Glass, Terrain Plume, CRT, Predictive Arc, Elemental shaders, Structure/Warp fields, 3D Paper, MacBook, woven cloth, holographic cards, point clouds and particle wordmarks.

**Tech evidence:** Vite + React; public `@designcodeio/threeui` 1.2.0 with React peers and Three `>=0.149`; source-faithful aliases for r128/r165. It mixes **raw Three.js, selected R3F, raw WebGL/WebGL2 + GLSL, Canvas2D, CSS3D and sandboxed full HTML**—not a single wrapper stack. Metadata exposes renderer passes, camera/pointer behavior, adaptive DPR and disposal. Sylva uses raw Three r149, ShaderMaterials, CanvasTextures and instancing; pointer parts moss, camera parallax moves, pollen trails and butterfly/scan-light create choreography. Iridescent Silk uses R3F/Three r160, simulated woven cloth, thin-film interference and bloom. Cortexa is a raw Three/GLSL point-cloud bust with haze and pointer-following. Kage preserves scroll/pointer/keyboard navigation in a full temple world.

Community npm/GitHub source is MIT; fonts OFL. Pro CLI is entitlement-gated. Launch pricing is $99/year or $199 lifetime; commercial/client products allowed, but no source redistribution or client extraction. Typography ranges from shell JetBrains Mono to scene-specific Onest and oversized 8–22vw display type with −.035 to −.08em tracking. Gradients generally emerge from lighting, fBm/noise, interference, bloom or simulations—not generic CSS blobs. Quality verdict: **S/S+ reference library**; worlds/materials are excellent, though performance/accessibility effort is real.

## Adaptable patterns for our hackathon site

- **Persistent product world** → hero through feature narrative → R3F/Three, 3–4 camera waypoints, semantic DOM overlays → **L**.
- **Orrery module architecture** → product capabilities orbit a core; selection retargets camera/light and opens real demo → instancing + GSAP timeline → **L**.
- **Cortexa data-resolution sequence** → abstract dataset particles resolve into live interface → custom points ShaderMaterial/FBO or CPU morph → **L**.
- **Skiper Interactive3d Hero** → pointer inspection in opening hero → R3F camera spring + studio lights → **M**.
- **Scroll-card camera director** → sticky product chapters drive camera/material state, not just card transforms → GSAP ScrollTrigger + Lenis + R3F store → **M/L**.
- **Image Reveal 71** → transition from cinematic promise to proof/demo → Framer Motion clip-path/brightness + sticky progress → **M**.
- **Localized liquid/halftone shader wipe** → landing-to-demo scene transition → fullscreen shader quad, 600–1000 ms uniform timeline → **M**.
- **Infinite Canvas demo** → explorable workflow/data map → GSAP inertial pan/zoom with keyboard controls → **M**.
- **Signature iridescent/glass material** → one product object under studio lights → MeshPhysicalMaterial/custom thin-film shader + restrained bloom → **M/L**.
- **Diagnostics control panel** → demonstrate real interactivity in live demo → Leva-like controls or custom accessible sliders bound to uniforms → **S/M**.
- **Adaptive cinematic system** → preserve usability → DPR cap, visibility pause, reduced-motion camera cuts, static fallback → **M**.

## Anti-patterns observed

- Calling CSS perspective or Canvas2D “3D” without identifying the renderer.
- Static hero meshes unrelated to product state.
- Combining several premium effects with no visual hierarchy.
- Generic gradient blobs instead of material/light/noise-driven color.
- Independent fade/slide sections instead of one directed spatial sequence.
- Cursor-only interactions without keyboard/touch parity.
- Bloom, particles and glass everywhere; they destroy focal depth.
- Treating motion-design films as interactive components.
- Copying branded Apple/Vercel/Nike references verbatim rather than adapting their motion grammar.

## Sources

1. https://skiper-ui.com/components — `research/sources/designB-01-skiper-components.md`, raw `designB-05-skiper-raw.html`
2. https://skiper-ui.com/docs/quick-start — `designB-10-skiper-quickstart.md`
3. https://skiper-ui.com/pricing — `designB-11-skiper-pricing.md`
4. Skiper individual pages `/v1/skiper12,14,16,17,18,28,29,36,39,44,71,73,88,90` — `designB-15` through `designB-28`
5. https://threeui.com/browse — `designB-02-threeui-browse.md`, raw `designB-06-threeui-raw.html`
6. https://threeui.com/installation — `designB-03-threeui-installation.md`
7. https://threeui.com/pricing — `designB-04-threeui-pricing.md`
8. https://threeui.com/terms — `designB-52-threeui-terms.md`
9. https://github.com/MengTo/threeui — `designB-12-threeui-github.md`, `designB-48-threeui-readme.md`
10. https://github.com/MengTo/threeui/blob/main/package.json — `designB-13-threeui-package.md`, `designB-47-threeui-package.json`
11. ThreeUI individual pages (Orrery, Kage, Cortexa, Betawise, Tidecrest, Halftone, Glass, Liquid Form, Terrain Plume, Typography Vortex, Glitter Card, 3D Paper, MacBook, Sylva, Warp, Cloth, Diagnostics, React Orbits) — `designB-29` through `designB-46`
12. https://threeui.com/three-js — `designB-53-threeui-three-js.md`
13. Site bundle/tech evidence — `designB-49-threeui-app.js`, `designB-50-skiper-css.css`, `designB-51-threeui-tech-extract.txt`