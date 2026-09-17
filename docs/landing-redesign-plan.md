# Landing and hero redesign

Status: Phase A built 14 Sep 2026 (lighting pass, scroll flight with three story frames, hero and mobile
header, `/` → `/city` split, venue mobile polish); Phase B (the live sample door-code ring, §6) is not
built. The sections below are the proposal as approved; where the build deviated it is noted inline.
Feedback it answers: the city reads as black blocks, the hero is text over a busy scene, the phone gets a
full-screen wall of copy, and the city/event picker is the whole first impression instead of a landing that
leads into it.

Build notes (14 Sep 2026):

- Lighting: the building material now has a real albedo (`#6f7a9a`) so the moon, a warm south-east fill and
  the hemisphere light do the modelling; the near-black albedo of the plan left every face the same black.
  Points clamp to 2–9 px, aviation lights blink red, the sky band is a dusk gradient with light pollution.
- Flight: five keys in `src/scene/flight.ts` (hero, I, II, III, city pose), centripetal Catmull-Rom, damped
  towards the scroll target, portrait keys 1.25× further with a wider fov. The haze thins at the hero
  (density 0.0014 → 0.0021 by frame I) so the far skyline reads from up high. Beacon labels stay hidden
  until the flight has nearly landed.
- Story: the frames replaced the programme's "How it works" section; copy is in `src/ui/site/copy.ts`.
- Developer links (`/?tour=auto`, `/?event=`) redirect to `/city` with the query intact.
- Decision 17 Sep 2026: public guided-run controls were removed at the owner's request after freezes on a
  Redmi Note 11. The route remains developer tooling and is not a required product path.

## 0. What the staging screenshots were actually showing

The published staging build is five commits behind `main`; its bundle predates the landing programme
(`d470d8c`) and today's city, descent and club work (`726e6b5`). Already on `main`, not on staging:

- the below-the-fold programme (How it works with three stills, Why identity-bound, For organisers,
  Under the hood, FAQ, footer) and the "Enter the city" primary button;
- beacon labels that climb the column to clear the copy and hide at the screen edges (the clipped
  "…n Night at Metropolis" chips on the phone);
- halos, ground pools, plaza light clouds, the skyline ring and height haze; pointer parallax;
- `← City` hidden under 640 px so the venue header no longer wraps into two lines.

Still true on `main` and what this plan is for: the building masses are too dark, the hero is copy over the
scene, the phone's first screen is all text, the header is a row of equal chips, and the city picker is the
first thing a visitor meets.

## 1. Concept — "Night flight"

The landing is one continuous descent into the Metropolis. Scroll is altitude: the page opens high above
the haze with the two beacons as thin columns to the horizon, and every scroll section is a stop on the way
down — over downtown, low around a plaza, across to the second beacon — until the camera settles on the
exact shot the city picker uses. "Enter the city" then swaps the words, never the world: the same canvas,
the same chapter, no cut. The city picker becomes the product surface that the landing lands on.

No new 3D content is needed for this; it is a camera path through the world that exists, plus a lighting
pass so the world is worth flying through.

## 2. Desktop structure (≥ 1024 px)

Fixed canvas behind a scrolling overlay, exactly as today. Top to bottom:

| # | Section (height) | Words | World (camera key) |
|---|---|---|---|
| 0 | Header (fixed) | Wordmark · environment chip · Passport. "Enter the city →" fades in on the right once the hero scrolls out. No "New passkey" on the landing (it stays on product routes). | — |
| 1 | Hero (100dvh) | Left column, vertically centred: kicker, two-line headline, one subline and primary "Enter the city". The original ghost guided-run control was removed on 17 Sep 2026. Bottom-left: "Scroll to descend ↓". Bottom-right mono status from config: "Monad testnet · 2 nights lit · free seats sponsored". No bill, no beacon labels. | High and far: `p(−40,150,430) t(0,40,0) fov 36`. City reveal (points assembling) plays here as today. |
| 2 | Frame I (90dvh) | Right-aligned block: "The venue is the seat map." + one line, the `pick.jpg` still as a film-frame card with numeral I. | Descending toward the club beacon: `p(−120,58,190) t(−38,14,−22) fov 38`. |
| 3 | Frame II (90dvh) | Left block: "One prompt. Your passkey signs." + one line, `sign.jpg`. | Low orbit past the club plaza, halo on the right edge: `p(−80,30,30) t(−38,16,−22) fov 40`. |
| 4 | Frame III (90dvh) | Right block: "The door reads a code that goes stale in a minute." + one line, `door.jpg`. Optional (phase B): a live sample door code ring, labelled "sample". | Crossing downtown to the theatre beacon: `p(20,44,90) t(44,18,12) fov 40`. |
| 5 | Tonight (100dvh) | Kicker "Tonight in the city", H2 with the live count ("Two nights are lit."), the bill (today's event cards, live, hover lights the beacon), city pulse, primary "Enter the city", "Host your own night →". | Settles on the city pose `p(0,78,236) t(0,18,0) fov 42` — identical to `/city`. |
| 6 | Programme | Today's `SiteSections` minus "How it works" (its three frames moved up into 2–4): Why identity-bound · For organisers · Under the hood · FAQ · footer. Ink gradient dims the world as now. | Holds the city pose. |

Camera between keys is a Catmull-Rom path sampled by damped scroll progress (progress is read per frame
from the scroll container, no scroll listener; damping ~6/s so a flick never snaps). Pointer parallax stays;
idle drift is off while the flight is active. `prefers-reduced-motion`: the camera holds the city pose and
the sections simply scroll. WebGL missing: the same DOM over the existing flat fallback.

Cards in section 5 go straight to `/e/<address>` and get the dive → flash → descent from wherever the
camera is (the director already allows a dive from the city chapter once the reveal has settled).

## 3. Mobile structure (≤ 640 px)

- Header: 36 px icon + "Turnstile" wordmark (no chain line); the environment label becomes a 6 px amber dot
  on the icon ring with a `title` (chip hidden below 640); one action chip on the right, "Passport", at
  28 px / 11 px. "New passkey" lives on the Passport page, where the create/sign-in action already exists.
  On `/e/*`, `/t/*`, `/gate/*`: an icon-only `←` chip + Passport. Nothing wraps at 360 px.
- First screen (100dvh): kicker · headline at `clamp(40px, 11vw, 56px)` (two lines) · one 15 px line ·
  primary CTA. The original guided-run text link was removed on 17 Sep 2026. The block is anchored at ~58 % height so the top of the screen is
  beacons and haze, with the bottom scrim under the copy. No cards on the first screen.
- Frames I–III: 70dvh each, copy bottom-anchored on the scrim, the still below it as a full-width 16:10 card
  (lazy). Camera keys use the same targets at 1.25× the distance with fov 48 so the beacon stays in frame.
- Tonight: kicker, H2, full-width bill cards, CTA. A sticky bottom pill "Enter the city" appears after the
  hero scrolls out and hides once this section or the footer is in view.
- Programme sections as today (they already stack).

## 4. Venue page (mobile polish, small)

- Header as above (icon-only back + Passport), so nothing wraps.
- Title `text-3xl`, the "Pick a seat…" line at 13 px, tier chips in one horizontal scroll row
  (`flex-nowrap overflow-x-auto`, 28 px chips), legend reduced to 10 px in one line under the chips.
- Top scrim to ~40 % of the viewport on portrait; the portrait overview pose drops its target ~2 units so
  the LED wall clears the header block. (The mobile quality tier itself stays §4.8 of the remaining-work plan.)

## 5. 3D scene changes

### 5.1 Readability — why it is black and what changes

Today the city has only a hemisphere light (`#34405f` / `#07080c` × 1.6) on a `#1a1f33` mass with a
`#0e1120` emissive, under a `#05060a` zenith, a `#141a2c` horizon and `#141a2c` fog. Vertical faces get
half of a dim sky and land at roughly the same luminance as the fog behind them, so masses and sky merge;
without bloom (low tier, and any still) the windows are the only thing left.

The fix is value separation in three layers — glowing haze band (lightest of the darks), building masses
silhouetted against it (darkest), lit detail on top (windows, street, beacons) — plus one key light so
nearby buildings show form. All of it is tuning of existing materials; no new programs on tier changes.

1. Sky dome: horizon `#141a2c → #1c2540`, band widened to ~0.35 elevation, downtown glow `#3a2414 → #4a2c16`
   and brighter over the two beacons; zenith stays `#05060a`. Fog colour follows the horizon (`#182038`) so
   distance dissolves masses *into a lighter haze*, which is what makes them read as silhouettes.
2. Moon key: one `directionalLight` `#7f95d6` × 1.4 from upper-left-behind (no shadow maps), giving a
   ~2:1 lit/shade face ratio on the downtown blocks.
3. Mass material (`makeMassMaterial`, same `onBeforeCompile`): base `#1e2439`, emissive `#0b0e1a`,
   roughness .8; add (a) street uplight — warm `#ff8a3d` emissive fading over ~20 units of height, weighted
   off roofs; (b) a fresnel rim (`pow(1−n·v, 3)`) in the moon colour so every silhouette edge catches the
   haze; (c) roofs mixed toward `#262e4a` so the skyline reads from the high hero shot.
4. Points (same instanced system, appended at the end of `buildCity` on the `drnd` stream so downtown's
   RNG stays identical across tiers): ~1,200 warm street lamps at y≈1.6 along the avenue grid, ~60 slow-blink
   red roof lights on the tallest masses; `gl_PointSize` clamped (`≤ 9·dpr`) so low passes never turn windows
   into blobs.
5. Street grid `#4a3320 → #5a3d24`; tone-mapping exposure 1.0 → ~1.12 in the city chapter only (set on
   chapter change; tuned by eye).

Target: a mid-distance facade at least ~12 L\* above the haze behind it, lit side vs shade side ≈ 2:1, no
extra noise (lamps and roof lights are sparse and small). Verified on the low tier headless (no bloom, worst
case) and in a real browser on the dev URL at high tier before publishing.

### 5.2 Flight

- `scene/flight.ts`: keyframes for landscape and portrait (`p`, `t`, `fov`, `at ∈ [0,1]`), Catmull-Rom
  sampling, a small store for progress. Tests: the path starts and ends where the specification says, the
  last key equals the city pose, sampling is continuous.
- `CameraRig`: a flight mode alongside the existing dive/descent moves — controls disabled, `setLookAt(…,
  false)` each frame from the damped progress, fov lerped, parallax kept, drift off. Leaving the landing for
  `/city` eases from the current pose to the city waypoint over ~1.2 s using the existing move struct (a
  no-op when the visitor has scrolled to the end).
- Keys stay ≥ 24 units above ground and away from the near plane so no mass pops and no point balloons.

### 5.3 Labels

Beacon name chips and leader lines render only on `/city` (product surface). The landing shows the columns
and halos; the words are in the DOM. Removes the label/copy collision class entirely on the landing; the
keep-out registry keeps doing its job on `/city`.

## 6. Copy

Headline — pick one:

- **A. "One passkey. Every door in the city."** (recommended: names the mechanism and the Metropolis, and
  echoes the "One passkey, many keys" bounty)
- B. "The ticket that knows it's you."
- C. "Access that follows you." (current)

Subline: "It buys the seat, opens the door and keeps your history private. No wallet, no app — the code on
your phone is signed by a key made for tonight alone."

Frames (one line each, bodies trimmed from today's `FRAMES`):

- I — **The venue is the seat map.** Tap a seat in the room; the card tells you the row, the price and
  whether it is yours, taken or listed.
- II — **One prompt. Your passkey signs.** The seat is minted to an address derived from your passkey. Free
  seats are sponsored by the relayer; a paid seat costs its face value.
- III — **The door reads a code that goes stale in a minute.** Codes rotate every 30 seconds and the door
  accepts the current slot and one either side. A seat admits once, so a screenshot never gets a second
  person inside.

Tonight: kicker "Tonight in the city" · "Two nights are lit." (count from config; "The city is dark
tonight." when empty) · cards · "Enter the city" · "Host your own night →".

CTA: primary "Enter the city" (→ `/city`). The original public guided-run controls were removed on
17 Sep 2026. `/city?tour=auto` remains available to the developer script only. All claims stay inside the
product rules: about a minute of validity, never "screenshots don't work"; notes private, attendance public.

## 7. CTA flow into the city and booking

```
/  (landing: flight + programme)
 ├─ Enter the city ──────────────► /city  (product surface: bill, beacons, labels)
 │                                   ├─ card / beacon ─► dive → flash → descent ─► /e/<address>
 │                                   │                     seat → checkout → /t/… → /gate/…
 │                                   └─ developer script / ?tour=…
 ├─ Tonight card ─────────────────► /e/<address> directly (dive from the landing's current pose)
 └─ Host your own night ──────────► /organise
```

- `/` → `/city` is a same-chapter cut: no curtain, the words swap, the camera eases to the city pose if it
  is not there already.
- `/?tour=…&event=…` redirects to `/city` with the same query for developer tooling.
  `scripts/judge-run.mjs` shoots `/city`.
- Wordmark and `← City` go to `/city` from product routes; the landing is reachable from the footer
  ("About Turnstile") and from the wordmark on `/city`.

## 8. What is reused

| Existing | Role in the redesign |
|---|---|
| `World`, `City`, `director`, `CameraRig` | Unchanged structure; rig gains the flight mode, City gains lamps/roof lights and the lighting pass. |
| `Landing.tsx` bill, `EventCard`, `CityPulse`, hover → beacon | Move to `app/routes/City.tsx` (product surface) and to the Tonight section. |
| `registerKeepOut` / label climb | Stays, used on `/city` only. |
| `SiteSections`, `copy.ts`, `UnderTheHood`, `Footer`, `FAQ` | Programme below the story; `FRAMES` (titles, bodies, stills) become the three flight sections. |
| `Tour`, `app/tour.ts`, `tour-target.ts` | Unchanged; start route becomes `/city`. |
| `Shell` header, `.chip`/`.btn`/`.glass`/scrims, `Kicker`, `Button` | Header gets the mobile variant and the scroll-in CTA; everything else as is. |
| Dive → flash → descent | Used from the landing's cards and from `/city`. |
| `shoot.mjs` / judge frames | Re-shoot the reference set after the route split. |

New files: `app/routes/City.tsx`, `ui/site/Story.tsx` (hero, frames, tonight), `scene/flight.ts` (+ test),
a portrait/landscape key table. Net: one route added, no new dependencies.

## 9. Risks and performance

- **Low tier during the flight.** Flying lower increases near overdraw and point sizes. Mitigations: keys
  stay ≥ 24 units up, `gl_PointSize` clamp, no new post passes, no new materials. The render loop already
  runs every frame, so the flight adds no cost beyond the camera maths.
- **Scroll mapping drift.** The overlay's height changes when the config loads (bill). Progress is computed
  per section from its rect against the viewport, not from total page height, so keys stay aligned with
  their words.
- **Scroll fighting the camera.** No scroll hijack, no snap: native scroll on every device; the camera
  follows with damping. iOS momentum scrolling is fine because the rig reads `scrollTop` per frame.
- **Route split.** Tour param redirect, `judge-run.mjs`, README links, the `data-tour="city"` target moving
  to `/city`, wordmark/`← City` targets. Covered by the existing tour tests plus a route test.
- **Bloom is invisible headless.** The lighting pass is tuned on the low tier (worst case) and checked in a
  real browser on the dev URL at high tier before publishing.
- **Copy claims.** Every line above stays within `docs` product rules; the sample code ring (phase B) is
  labelled "sample" and never pretends to be a live ticket.
- **Time.** Phase A ≈ 2.5 days: lighting pass ½, flight + story 1, hero/header/mobile ½, `/city` split +
  tour/judge/tests ½, then the judge frames re-shot. Phase B (live sample door code in Frame III) ≈ ½ day.
  A venue beat inside the scroll story is **not** recommended: chapter swaps driven by scroll would thrash on
  low tiers and double the shader budget; the stills carry those frames.
- **Staging.** None of this is visible on the published staging site until it is republished; the same is
  true of everything since `d470d8c`.

## 10. Order of work (phase A)

1. Lighting pass (§5.1) — shoot the city low tier at 1440×900 and 402×874, compare against today's frames.
2. `/city` route split + header variants + tour/judge redirects; tests green.
3. Flight keys + rig mode + `Story.tsx` desktop; then portrait keys and the mobile layout.
4. Venue header polish (§4).
5. Re-shoot judge frames and the three `site/*.jpg` stills; update `remaining-work-plan.md` (row 6b).
6. Gate, commit, push; then publish staging and check on a real phone.
