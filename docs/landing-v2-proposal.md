# Landing v2 — redesign proposal

_15 Sep 2026 · status: **direction A approved** ("The Door, then the City"), same day. Decisions taken with
it: one night look everywhere (no dusk band, no fog ramp); the hero at the gate line at eye level; façades,
windows and the city first, the `/` vs `/city` separation with it; the waterfront and the live door-code ring
wait until the core look is approved on staging. The engine spike referenced below became the first
city-v2 commit._

Phase A (`16eb253`, `d086bfc`) shipped the mechanics — a scroll-driven flight, the `/` ↔ `/city` split, a
lit city — but not the experience. This document diagnoses why, answers the five questions asked, and
proposes one direction with a schedule that still leaves room for the demo video before 13 Oct.

The visual plan is the board `attached_assets/landing-v2-board.jpg` (Replit workspace, not the repo): the
current staging, two frames from the engine spike, two target-mood concepts.

---

## 1. Diagnosis — why Phase A reads as "the same page"

1. **One scene, one altitude, one camera family.** The landing reuses the picker's world _and_ its
   viewpoint: every landing key sits 45–125 m up looking down at the same block field the picker shows
   from 200 m. Any move between those poses is, correctly, perceived as zooming the dashboard.
2. **Two things changed at once and neither was a story beat.** The hero looks toward the horizon (where
   the dusk band lives) with thinner haze; frames I–III look down at dark ground with thicker haze. The
   effect is "weather", not narrative.
3. **The masses carry no detail where the eye lands.** Windows are screen-space points (2–9 px dots), so
   any building nearer than ~150 m is a bare slab with sprinkles. No setbacks, crowns, lit streets,
   plazas, water, signage; nothing that says _Metropolis_ rather than _grid of boxes_.
4. **The copy is laid beside the scene, not composed with it.** Nothing in the frame is _for_ the text;
   the hero shows no product; the secondary CTA is a mono chip; the frame cards are screenshots.
5. **The picker is still the first impression** because the hero is the picker's camera with a headline.

The spike below shows that (3) is cheap to fix and (1)–(2) are design decisions, not engineering ones.

## 2. The one-hour engine spike (evidence, uncommitted)

A window grid computed in the mass material's fragment shader (cells in metres from the instance scale,
per-building lit fraction, warm/cool tint, dark glass when unlit) replaced the face points. Two frames
on the board, low tier, no bloom:

- **Picker altitude** — the block field turns into a city: floors, lit/unlit rhythm, silhouettes read.
- **Skyline altitude (26 m up, 210 m out)** — the first frame of this project that looks like a landing.

It also showed what does _not_ work yet: a **street-level** camera (2–4 m up) is inside the ground haze,
sees bare ground and one over-scaled face — the world was never built for that altitude. A street-level
hero is therefore the most expensive option (§4), not the cheapest.

Patch: `.config/spikes/facade-windows.patch` (workspace). ~130 lines, `materials.ts` + a density switch
in `City.tsx`; the production version needs lit-fraction tuning (spike is too bright on low blocks), a
ground-floor band, and far-field points kept for sparkle beyond ~300 m.

## 3. Answers

### 3.1 What should the landing look like? — **"The Door, then the City."**

A four-beat crane shot: it opens at a **door** (the product's namesake) and ends on the **map of doors**
(the picker). Same world, opposite altitude language: the landing lives at 2–40 m and looks _across_ the
city; the picker lives at 200 m and looks _down_. The overhead view appears exactly once on `/` — as the
last beat, which is the hand-over.

| Beat | Scroll | Camera | 3D on screen | UI / copy |
| --- | --- | --- | --- | --- |
| **0 · Hero: The Door** | 0 | 1.7 m up, 9 m from a gate line at the club's plaza, fov 34, slight tilt up | Three turnstile gates (matte posts, glass wing, amber light bar, glowing scanner panel showing tonight's code), wet plaza with reflections, the beacon column rising behind, skyline with lit façades | Headline top-left over the sky: **One passkey. / Every door in the city.** One sentence. Primary **Enter the city →**. The proposed secondary guided-run button was removed on 17 Sep 2026. A quiet proof line: _Live on Monad testnet · Passkeys · Relayed free seats · Envio indexing_ |
| **I · Pick a night, pick a seat** | 0.25 | pulls back and up to 12 m, the plaza and venue façade fill the lower frame | Venue building with marquee/signage at the column's foot; traffic streaks on the avenue | The real seat map in a device frame, anchored to the venue with a leader line. _Every night is a contract on Monad. Pick a seat; it is minted to you._ |
| **II · Your passkey signs** | 0.5 | rises along the column to 40 m | The column, rooftops, crowns; a second door lights across the grid | The passkey sheet (stylised OS prompt). _The passkey is the account. Free seats are relayed; a paid one is sent from your own account._ |
| **III · The door reads a code** | 0.75 | swings to the theatre's plaza at 20 m, looking down at its gates | The theatre's gate line, code panels rotating | The ticket with the live code in a device frame. _Codes rotate every 30 s, signed by a key derived for this door alone. A copy is stale within a minute; a seat admits once._ |
| **IV · Every door in the city** | 1.0 | climbs to the picker's pose (200 m) — the current `CITY_POSE` | Beacons across the map, lit streets, river | _Tonight in the city_ — the bill (2 cards) + **Enter the city →**. Click: the landing overlay fades, the map UI fades in, route becomes `/city`, camera does not move. |

Lighting is **one night** throughout: deep blue sky, a faint warm _city glow_ at the horizon (light
pollution, not dusk), constant exponential haze, height haze only in the far field. No fog ramp. The only
thing that changes as you scroll is the story: doors light up.

Typography and UI get a proper landing system: a display serif at three sizes, one paragraph width, real
buttons (primary filled amber, secondary outlined), device frames rendered from the live UI (not
screenshots), and copy blocks that sit in composed negative space (sky, water, plaza) rather than beside
the scene.

### 3.2 Should we stop reusing the exact city picker as the landing scene? — **Composition yes, world no.**

- Stop reusing the picker's **camera and framing**. The landing gets its own vantage points (plaza, column,
  skyline) and its own UI treatment (no chrome, big type, product frames).
- Keep **one world**. Every hour spent on façades, streets, plazas and atmosphere pays three times:
  landing, picker, demo video. A second, separate hero scene would split three weeks of art budget and
  guarantee the two surfaces look unrelated.
- Give the picker a distinct **console** treatment so it stops looking like a dimmer landing: labels and
  leader lines, the bill, a legend/compass and a short title. There is no public guided-run control.

### 3.3 What 3D upgrades are realistic before 13 Oct?

Effort is calendar days of AI-assisted solo work. "Tier" says what the phone/low tier gets.

| # | Upgrade | Impact | Effort | Tier | Priority |
| --- | --- | --- | --- | --- | --- |
| 1 | **Façade windows in the shader** (lit fraction by height/district, warm/cool, dark glass, ground-floor band, slow flicker on a few) | very high | 1 d (spike done) | all | must |
| 2 | **Massing variety**: 2–3-tier setbacks on tall buildings, crowns/spires/antennae, rooftop mech boxes, a few slab-vs-tower proportions | high | 1 d | all | must |
| 3 | **Streets**: asphalt ground shader with lane lights and lamp pools, **traffic streaks** (instanced additive quads on the avenues) | high (motion) | 1 d | streaks halved on low | must |
| 4 | **Plazas + gates**: a plaza per beacon (paving, low walls, lamp posts), a stylised turnstile gate line (primitives, emissive bar, code panel), wet-ground reflection | high for the hero | 1.5 d | reflection off on low | must for direction A |
| 5 | **One night lighting + atmosphere**: horizon glow down, bloom tuned per tier, far-field points kept, low mist at plazas | high | 0.5 d | bloom high only | must |
| 6 | **Venue façades** at the two beacons (theatre with marquee, club as a low pavilion with neon) + 4–6 **signage** panels (canvas-drawn, abstract or event names) | medium-high | 1 d | all | should |
| 7 | **Landmark**: one tapered spire with a crown light on the skyline ring, placed to frame the hero | medium | 0.5 d | all | should |
| 8 | **Waterfront**: clear a sector of the ring, water plane with shimmer, a lit bridge, reflections on high | medium-high (map & hero) | 1.5 d | mirror off on low | could |
| 9 | Perf tiers for all of the above, instance counts, one Chromium-verified frame per tier | — | 0.5 d | — | must |

Not realistic and not proposed: photoreal materials/textures per building, true reflections everywhere,
simulated traffic with vehicles, pedestrians, volumetric lighting, imported city models (asset weight,
mobile). The identity stays **stylised-geometric**; the premium comes from detail where the eye lands,
motion, and atmosphere.

### 3.4 What remains on `/` versus `/city`?

| `/` — the landing | `/city` — the picker |
| --- | --- |
| Hero + beats I–IV, _Tonight in the city_ (bill as preview), footer | Map at `CITY_POSE`, beacon labels + leader lines, the bill as the working list |
| Primary CTA **Enter the city →**. The proposed guided-run CTA was removed on 17 Sep 2026. | _Host your own night_, env chip, account actions. The guided run remains developer tooling only. |
| No env chip, no account actions, no picker chrome, no labels until beat IV | No story copy; title _Pick a night._ and one line |
| Redirects `?tour` / `?event` to `/city` (unchanged) | Direct entry for judges and return visits; `← City` from every product route (unchanged) |

### 3.5 Recommended direction — and two cheaper ones

- **A · "The Door, then the City"** (recommended). Everything above. City upgrades 1–5 + 9 (5.5 d), 6–7
  (1.5 d), landing build (5 d incl. mobile). Waterfront (8) only if week 2 is on time.
- **B · "Skyline, then the City"** (−2 days). The hero is the 26 m skyline frame from the spike with a
  rooftop or water foreground instead of gates; beats I–III at 20–40 m; no plazas/gates. Loses the
  literal door and the strongest product image; keeps every city upgrade.
- **C · Product-first hero** (−4 days). Typographic hero with the live ticket tilted in 3D, city dimmed
  behind; beats as product frames; the 3D city appears at the CTA. Fastest, least "3D storytelling";
  a fallback if week 1 slips.

A and B share weeks 1 and 3; the choice can be made after the plaza/gate prototype on day 4 of week 1
(go/no-go on the gate's look).

## 4. Schedule to 13 Oct

| Week | Dates | Work | Exit check |
| --- | --- | --- | --- |
| 1 | 15–21 Sep | City v2 core: façades, massing, streets, plazas + gate prototype, one-night lighting, tiers | Republish staging; phone + desktop check; go/no-go on the gate |
| 2 | 22–28 Sep | Landing v2: hero, beats, device frames, map hand-over, `/city` console, mobile; venue façades + signage + spire; waterfront if ahead | Republish; full walkthrough on phone; submission form opened with placeholders |
| 3 | 29 Sep–5 Oct | Product: §4.4 theatre reframe, §4.5 seat view in followspot, §4.6 finale, §4.8 mobile tier; fixes from device testing; copy pass | Republish; judge run green on staging |
| 4 | 6–13 Oct | Demo video (site frozen first), README/submission, buffer | Submitted ≥ 24 h early |

Gate before every commit, one commit per coherent batch, as before.

## 5. Risks

- **Phones.** Reflections, traffic and bloom stack up; tiers must drop them, and every milestone gets a
  real-device look on staging (headless cannot see bloom or measure frame time).
- **The gate model.** Primitives can look cheap; the prototype must pass an eyeball test on day 4 or we
  take direction B without losing time.
- **Scope in the city.** Items 6–8 are the ones to cut; 1–5 are not negotiable for either direction.
- **Video needs the site frozen** — week 4 is not a build week.

## 6. Decisions needed

1. Direction **A**, **B** or **C**.
2. One-night lighting (no dusk band, no fog ramp) — confirm.
3. Waterfront in or out of scope for now.
4. Hero code panel: static-looking code texture now, or the live door-code ring (Phase B, +1 d).
