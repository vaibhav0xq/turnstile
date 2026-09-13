# Subagent result: uxui-docs

## What the documents are

### UX Guide: Universal Principles for Interface Behavior, Feedback and Trust
- **Intent:** A standalone, domain-neutral behavior guide for web, mobile, desktop, and internal tools. Its unit of design is the complete task—entry, action, wait, result, and recovery—not a polished happy-path screen. It explicitly says it is guidance, not an implementation plan or proof that anything was built.
- **Structure:** 18 sections: foundations and named UX laws; discovery and decision support; first impressions; trust; interaction states/errors/forms/reversibility; engagement and dark patterns; accessibility/mobile; speed/resilience; screen archetypes; truth boundaries; measurement; checklists; evidence gaps/register; provenance.
- **Evidence scheme:** **Established guidance**, **Academic finding**, **Practitioner recommendation**, **Hypothesis**, **Historical anecdote**, and **Unverified or unclear**. Claim-level verdicts additionally include supported, qualified, contradicted/corrected, historical, illustrative, and unverified. It repeatedly warns that standards, studies, vendor cases, and anecdotes are not interchangeable.
- **Origin:** Section 18, “Research lineage,” says this edition descends from a 6 Sept 2026 consolidation of 28 sources, a ~5,900-word practitioner transcript adjudicated against 66 URLs, and an 8 Sept 2026 universalized edition derived from an earlier single-product version.
- **Apparent domain:** Nominally generic, but materially **e-commerce-flavoured**: product lists, filters, comparison, saved sets, quantities, totals, delivery, ratings, checkout-like commitments. Its strongest transferable material for us is state truth, transaction uncertainty, error recovery, accessibility, and performance.

### UI Guide: Universal Principles for Visual Composition, Components and Motion
- **Intent:** The visual companion to UX.md: hierarchy, composition, typography, color, numeric display, responsive behavior, components, motion, performance, tokens, and review. It explicitly leaves final identity, palette, font, stack, and motion intensity to the product team.
- **Structure:** 27 sections, moving from hierarchy/grid/type/color/numbers/media through collection and commerce patterns, responsive composition, overlays, state grammar, motion, performance, tokens/contracts, surface archetypes, standards, visual review, reference adaptation, library evaluation, evidence coverage, and sources.
- **Evidence scheme:** **Established standard**, **Academic finding**, **Practitioner or tool material**, and **Hypothesis**. Section 26 separates accessibility standards, academic perception research, public usability research, browser docs, mature design systems, practitioner playbooks, and reference-decomposition methods, each with explicit limits.
- **Origin/material:** A large synthesis of WCAG/WAI-ARIA, NN/g, web.dev/MDN, Material and Carbon, Baymard, academic visual-perception work, and numerous practitioner/design-skill corpora. It says material was deduplicated and version-pinned where possible, but does not claim every archived word was fully read or every recommendation independently tested.
- **Apparent domain:** Also declared domain-neutral but even more visibly **commerce/catalogue-oriented** (cards, galleries, ratings, swatches, comparison, cart quantities, totals). The typography, color, overlays, states, responsive, motion, and performance sections are highly transferable.

## Keep: actionable rules (with refs)

1. **Design the full onchain state machine, not one success screen.** For wallet/connect/sign/submit flows cover initial, pending signature, submitted, partially available, confirmed, rejected, reverted/failed, stale, canceled, restricted, and unconfirmed outcomes. For each state define what triggered it, what is known, what remains usable, persistence, status announcement, and next action. *(UX §1, “State completeness is an interaction contract”; UX §7, “Complete state coverage”)*

2. **Never claim more certainty than the chain/system provides.** Distinguish local intent, wallet approval, transaction submission, pending inclusion, and authoritative confirmation. If confirmation cannot be obtained, say the outcome is unconfirmed and reconcile before inviting a retry that could duplicate an effect. *(UX §1, “Truth is a shared requirement”; UX §7, “Optimistic updates versus confirmed state”)*

3. **Every important viewport answers three questions immediately:** current context, primary content/decision, and next meaningful action. Treat scale, saturation, contrast, and whitespace as one salience budget; usually allow one Tier-A visual region. *(UI §2, “Define the attention contract”)*

4. **Earn first-impression quality through a coherent system, not novelty in every control.** Keep operation familiar while identity comes from art direction, typography, spatial rhythm, shape/depth logic, and selective asymmetry. Test “looks premium” separately from “can complete the task.” *(UX §5, “Evaluate appearance and usability separately” / “A coherent and original identity”; UI §2, “Preserve familiarity while building identity”)*

5. **Use display typography only for short cinematic/editorial moments.** Product facts, token amounts, wallet/status copy, controls, and errors need stable task typography. Define roles by purpose; each token includes family, fallback, size, weight, leading, tracking, and numeric behavior. *(UI §4, “Define roles by purpose”)*

6. **Typography floor:** body around **16/24** and support around **14/20** are adjustable starting points; body copy generally targets **50–75 characters/line**; headings may start around **24/32**. Body leading around **1.45–1.6** and short headings **1.25–1.4** are tuning ranges, not laws. Permit wrapping rather than clipping. *(UI §4, “Control measure, wrapping and text growth”; UI §21, “Illustrative starting scale”)*

7. **Stress-test type and layout:** content/function must survive 200% text resize, WCAG text-spacing overrides, long labels/identifiers, font fallback, and narrow widths. Ordinary vertical content should reflow at the equivalent of **320 CSS px** without page-level horizontal scrolling. *(UI §4, “Control measure…”; UI §14, “Reflow, resize and long copy”; UI §21, “Accessibility reference”)*

8. **Use semantic color roles, then choose pigments.** Define canvas/base/raised/tinted surfaces, primary/secondary text, action, focus, selected, pending, success, warning, and error. Do not bind components directly to raw hue names or use one hue for unrelated meanings. *(UI §5, “Define semantic color before pigments”; UI §19, “Separate meaning from raw values”)*

9. **Meet rendered contrast, including compositing:** normal text **4.5:1**, qualifying large text **3:1**, and required component/state graphics **3:1** against adjacent colors. Test text over every gradient/image crop and every alpha layer; test hover, focus, pressed, selected, pending, error, and disabled independently. *(UI §5, “Test rendered contrast pairs”; UI §21, “Accessibility reference”)*

10. **Color is never the only state channel.** Selected, focus, success, warning, error, and unavailable states need text, shape/icon, border/ring, or another independent cue. A selected focused control must show both selection and focus. *(UI §16, “Use at least two independent state channels” / “Give every state a distinct meaning”)*

11. **Numbers/tokens are semantic statements.** Keep raw value and unit separate from presentation; use locale-aware formatting; show chain/token symbol, precision, sign, basis, and time zone where relevant; never use zero as missing data. Use tabular numerals for aligned or live-changing amounts and reserve enough width to prevent jitter. *(UI §6, “Treat a number as a semantic statement”; “Format values through locale data”; “Choose numeral styles for the task”)*

12. **Complete component states:** default, hover, focus-visible, pressed, selected/toggled, disabled/unavailable, loading/pending, error, success, expanded/collapsed, and read-only. Loading keeps dimensions and the action’s accessible identity stable. Hover cannot contain the only route or explanation. *(UX §5, “Control states as a quality signal”; UI §16, “Give every state a distinct meaning”)*

13. **Acknowledge immediately; show only real loading.** Pressed feedback should be immediate. Skip spinner flashes for synchronous work and never delay a ready result for choreography. Use skeletons only where the final structure is predictable; reserve geometry; use determinate progress only for genuinely measurable work. *(UX §11, “Choose feedback by the kind of wait” / “Timing and response-time guidance”; UI §16, “Loading without invented waiting”)*

14. **Error copy has three parts:** what did not complete, the reason only if genuinely known/safe, and what to do next. Avoid blame and do not expose stack traces, paths, queries, framework details, or secrets. Keep errors persistent and scoped near the failed field/region; never make a disappearing toast the only recovery route. *(UX §7, “Useful error copy: outcome, known reason and next action”; “Feedback placement by scope and consequence”)*

15. **Preserve user work on failure.** Keep entered values, wallet context, selected asset, amount, active filters, and scroll context. A partial independent failure should not blank the app; retry the affected region when independence is truthful, but reconcile coupled values together. *(UX §7, “Partial failure and graceful degradation”; UX §11, “Partial loading and meaningful failure boundaries”)*

16. **Disabled is an honest availability state, not hidden validation.** If the user can correct a condition, an enabled action that reveals precise validation is often clearer. If disabled, explain why in readable inline text—not hover-only—and ensure `aria-disabled` behavior actually suppresses activation. *(UX §7, “Disabled controls and the validation contradiction”; UI §16, “Disabled, pending, cancellation and repeated activation”)*

17. **Match protection to consequence.** Cheap reversible edits should update immediately with nearby, exact Undo; irreversible/high-impact onchain actions require a consequence-specific confirmation and safe Cancel path. Animation or toast is not reversal. *(UX §7, “Reversibility, undo and confirmation”; UI §16, “Confirmation versus Undo”)*

18. **Responsive means recomposition, not shrinkage.** Break when real content pressure demands it, not by guessed device category. Preserve state, focus, purpose, and capabilities across wide panel → drawer/sheet or tabs → accordion changes. Sticky regions must not cover fields, errors, focused controls, or mobile browser/keyboard safe areas. *(UI §14, “Change composition in response to content pressure”; “Safe areas…”; “Focus and scroll ownership…”)*

19. **Targets and input:** WCAG AA’s target floor is **24×24 CSS px** with exceptions; use roughly **44×44 px** as a comfortable starting point for primary touch controls. Never require hover or dragging; provide click/keyboard/tap alternatives. Hit regions must not overlap. *(UI §14, “Touch, mouse and hybrid input”; UI §21, “Accessibility reference”)*

20. **Overlay contract:** every modal has a visible title and Close, one clear scrolling region, inactive background, appropriate initial focus, Escape/Cancel where safe, and focus return to the trigger. Non-modal popovers do not trap focus or freeze the page. Backdrop blur is styling, not modality. *(UI §15, “Choose a surface by its role”; “Modal and non-modal state grammar”; “Backdrops communicate but do not implement modality”)*

21. **Motion must remain interruptible and state-independent.** Entrance/exit should explain origin/destination; anchored layers originate near triggers; drawers return to their entering edge. `ease-out` is a useful entrance start, `ease-in-out` for continuous relocation; tweens suit deterministic states, springs suit velocity/gesture/reversal. New input cancels/retargets old motion; animation completion must never commit application state. *(UI §17, “Make motion geometry explain origin and destination”; “Choose easing and springs…”; “Support interruption, reversal and rapid input”)*

22. **Motion timing starting bands:** roughly **100–160 ms** micro-feedback, **160–240 ms** ordinary transitions, and **240–360 ms** larger reveals—then tune for distance, scale, frequency, interruption, and device. State/text must be usable before motion finishes. *(UI §21, “Illustrative starting scale”; UI §17, “Make motion geometry…”)*

23. **Reduced motion is a designed alternate, not `0.01ms` everywhere.** Replace drawer travel with instant visibility/short fade, shared-element zoom with crossfade, parallax/3D tilt with static depth, shimmer with quiet status, stagger with simultaneous reveal, and icon morph with direct swap. Honor from first render and react to preference changes. *(UI §17, “Provide meaningful reduced-motion alternatives”)*

24. **Performance is part of the visual contract.** Reserve image/3D-canvas space, limit font weights, avoid `transition: all`, coalesce scroll/pointer updates with rAF or native timelines, stop every loop offscreen/unmount, and profile large transforms, blur, filters, masks, and `preserve-3d`. Reference targets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at p75—not proof until measured. *(UI §18, “Do not assume transforms are free” / “Batch measurement…”; UX §11, “Core Web Vitals”)*

## Conflicts with the cinematic brief + reconciliation

1. **“Motion should explain state” and avoid decorative/continuous attention capture** could flatten the explicit cinematic mandate. *(UX §5 “Motion should explain change”; UI §17 “Use motion to explain state”)*  
   **Reconcile:** Treat the landing/demo as an editorial storytelling surface where motion also establishes mood, scale, world, and narrative continuity. Inside the operational app, revert to state-explanatory motion. Never let spectacle falsify status or delay action.

2. **“Constrain three-dimensional and immersive effects” says 3D is not a task-interface default and warns against parallax, tilt, and scroll-jacking.** *(UI §17)*  
   **Reconcile:** Reject the “not default” conclusion for the landing because real 3D is a requirement, but retain its guardrails: stable reading plane for factual copy/CTAs, ordinary scroll semantics, touch/keyboard path, reduced-motion static composition, low-end fallback, and bounded GPU cost. Keep dashboards mostly planar with selective spatial depth.

3. **“Protect the attention budget” explicitly puts page-wide parallax, dramatic reveals, branded preloaders, and scene-like effects outside default task flows.** *(UI §17)*  
   **Reconcile:** Landing/demo is intentionally not a routine task flow; spend the attention budget there in a choreographed sequence. Once the user enters wallet/transaction/product work, quiet the visual field sharply. Avoid a fake theatrical preloader; stream real content promptly.

4. **“One strong authored move per viewport” / “one Tier-A region” can seem too restrained for cinematic scenes.** *(UI §2, “Budget novelty and visual tension”; “Define the attention contract”)*  
   **Reconcile:** Keep one *dominant spatial composition* per scene, but that composition may contain multiple coordinated 3D layers. Treat camera, lighting, typography, particles, and object motion as one authored move rather than five competing effects.

5. **Warnings against entrance cascades and every-scroll reveals conflict with scroll-driven storytelling.** *(UI §17, “Choose easing and springs…”)*  
   **Reconcile:** Use a small number of major scene transitions tied to narrative sections, not independent animation on every card/line. Content must become available early, scrolling must stay interruptible, and reverse scrolling must resolve coherently.

6. **Generic shared rails, familiar skeletons, and conventional component anatomy can water down spatial composition.** *(UI §3, “Use shared rails…”; UI §2, “Preserve familiarity…”)*  
   **Reconcile:** Let cinematic objects break the outer rail and occupy depth, but return readable copy, CTAs, wallet states, values, and dialogs to a stable screen-space rail. Familiar behavior does not require flat visual treatment.

7. **“Transforms and opacity” guidance may tempt fake-3D CSS instead of the requested real 3D experience.** *(UI §17/§18)*  
   **Reconcile:** Use WebGL/Three/R3F or equivalent for genuine camera, lighting, geometry, and spatial transitions; use DOM transforms for overlay continuity. Profile both. The guide’s performance warning is valid even when real 3D is mandatory.

**Recommended boundary:** **Landing/demo = cinematic editorial mode** (real 3D, pointer/scroll choreography, atmospheric transitions, authored staging). **App/product surfaces = operational mode** (stable geometry, quiet motion, explicit pending/confirmed chain states, accessible forms and overlays). The visual identity, typography, lighting, palette, and depth language should connect both modes.

## Ignore

Ignore these as direct design requirements unless the actual product later contains the corresponding feature:

- Product assortment/listing, category navigation, e-commerce search-query taxonomies, filters/sorting, and “no product results” specifics. *(UX §3; UI §§8, 11–12)*
- Product-detail galleries, in-scale photography, thumbnails, image swatches, option-specific product media, and pack-size guidance. *(UX §6 imagery; UI §§7, 9)*
- Ratings distributions, review counts, testimonials/eWOM, promotional discounts, crossed-out list prices, and third-party promotional modules. *(UX §6; UI §10)*
- Cart quantity steppers, line items, shipping/delivery dates, provider/source rows, checkout arithmetic, and catalogue comparison tables. *(UI §§12–13; related UX examples)*
- E-commerce-specific Baymard percentages and abandonment/conversion figures; they are not forecasts for an onchain product.
- Habit-loop, notification, gamification, badges, streaks, leaderboards, and re-engagement material unless these are intentional product features. *(UX §8 and relevant §2 subsections)*
- Password-policy specifics unless authentication/password creation exists. Wallet connection alone does not justify password UI. *(UX §7 “Forms…”)*
- Full localization/RTL machinery if hackathon scope is explicitly English-only; still keep number/token precision and layout growth robust.
- Multi-theme guidance if only one polished theme is planned; the guide itself says one complete theme is better than an incomplete switch.
- Virtualization/infinite-list guidance unless measured collection size requires it. *(UI §18 “Skip rendering in long collections carefully”)*
- Specific borrowed design-system columns, breakpoints, palette recipes, radius formulas, and template styles. They are examples, not requirements.

Do **not** ignore honesty/dark-pattern guidance merely because its examples are commercial: no fake network activity, fabricated transactions, false scarcity, invented user counts, or simulated proof presented as real.

## Quality floor checklist

### Landing / cinematic layer
- [ ] First viewport makes product identity, value proposition, and primary CTA obvious despite the 3D scene.
- [ ] Each scene has one dominant composition; particles, light, type, camera, and UI do not compete indiscriminately.
- [ ] Scroll/pointer motion is interruptible, reversible, and never gates essential content or action.
- [ ] Mobile/touch/keyboard users have equivalent navigation; nothing essential depends on hover, drag, or precise pointer position.
- [ ] `prefers-reduced-motion` is honored from first render with static depth/crossfades, no parallax/tilt/stagger/shimmer, and the same content/end state.
- [ ] A low-performance fallback preserves message and CTA if full 3D is unavailable or too costly.
- [ ] 3D/canvas/media geometry is reserved; page content does not jump when assets/fonts arrive.
- [ ] Text over imagery/gradients passes rendered contrast; readable screen-space panels are used where backgrounds vary.
- [ ] No artificial preloader, fake scanning, invented live activity, or delayed ready result.
- [ ] Offscreen loops/timelines pause; pointer/scroll work is frame-coalesced and all observers/listeners clean up.

### Product / onchain app
- [ ] Every core flow visibly distinguishes wallet intent, signature request, submitted/pending, confirmed, rejected/failed, and unconfirmed states.
- [ ] No optimistic “success” is shown for consequential onchain work before authoritative confirmation.
- [ ] Errors state outcome + known reason (only if known) + next action; recovery remains near the failed scope.
- [ ] Duplicate transaction intent is prevented safely; ambiguous outcomes reconcile before retry.
- [ ] Loading/skeletons represent real work, keep dimensions stable, and never replace a known error or ready result.
- [ ] Buttons/controls have distinct default, hover, focus, pressed, selected, disabled, loading, error, and success treatments.
- [ ] Selection/status never relies on color alone; focus remains visible on every surface and is not clipped/covered.
- [ ] Token values show symbol/unit, honest precision, locale-aware grouping, missing/unavailable state, and tabular figures where alignment changes live.
- [ ] Destructive/irreversible actions name exact consequences and require suitable confirmation; reversible local edits have a real Undo.
- [ ] Modals/drawers have title, visible Close, Escape where safe, one scroll owner, inert background, focus containment, and focus return.
- [ ] Responsive recomposition preserves entered values, selected asset, transaction context, scroll, focus, and all essential capabilities.
- [ ] At 320 CSS px equivalent width, 200% text size, and long-copy stress, no essential content/action clips or causes page-level horizontal scroll.
- [ ] Normal text meets 4.5:1, large text 3:1, and essential non-text state/control cues 3:1.
- [ ] Primary touch targets are about 44×44 px where feasible; no overlapping hit areas; keyboard and single-pointer alternatives work.
- [ ] Core Web Vitals and animation cost are measured on representative mobile/desktop hardware; target LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at p75.
- [ ] Final review covers long IDs, large balances, zero/missing values, failed media, stale/partial data, rapid repeated input, font failure, reduced motion, and narrow viewport—not only the hero screenshot.