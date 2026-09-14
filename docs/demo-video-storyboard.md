# Demo video — storyboard and capture plan

Target: **under two minutes**. One continuous run of judge mode against the Monad testnet deployment is the
A-roll; a short cold open, a few cutaways and a closing card are the rest. Everything shown is real: three
transactions land on testnet during the take.

## What the run measures

Judge mode against the deployed origin (14 Sep 2026, `pnpm --filter @turnstile/web run judge -- --base
<origin>`, real WebAuthn through a virtual authenticator):

| Step | Bar reads | What happened |
|------|-----------|---------------|
| city | 0 s | landing, bar up, beacon pulsing |
| pick | ~3 s | club overview, tier chip highlighted |
| checkout | ~8 s | seat card → checkout panel; **prompt 1** at ~16 s; mint 0.8 s; **prompt 2**; bind 0.65 s |
| ticket | ~30 s | QR + countdown ring; `Walk up to the door` |
| door | ~38 s | code in the scanner, `Admit`, check-in 1.2 s, `Go in.` |
| lit | 38.2 s (bar stops) | +2.2 s cut to the room, +3.3 s camera drops behind the seat, followspot |

Totals: **38.2 s on the bar · 6 taps · 2 passkey prompts · 3 transactions**. Locally against anvil the same
run reads ~36 s; the difference is testnet confirmation time, which is the honest number to show.

The bar keeps counting while a human reads the screen, so a leisurely take ends nearer 60–80 s. Two ways to
handle it, pick one before recording:

- **Natural pace (recommended).** Let autoplay drive (`?tour=auto`), only touch the two passkey prompts, and
  accept a ~40 s bar. Stretch the cut to two minutes with holds and the B-roll below. The final number on the
  summary card stays the one the README claims.
- **Presenter pace.** `?tour=1`, press every control on camera, talk over it. Simpler edit, but the card
  will read 60 s+; say "about a minute" in the voice-over rather than quoting the bar.

## Capture

- **Record the display, not the tab or window.** The passkey sheet is an OS window (Touch ID / Windows Hello
  / phone prompt); tab and window capture drop it, and the two prompts are the point of the video. OBS
  *Display Capture* (macOS: grant Screen Recording), 1920×1080, 60 fps, system audio off; voice-over later.
- Browser full-screen (`F11` / `⌃⌘F`), 100 % zoom, no extensions, no bookmarks bar, dark OS theme, cursor
  hidden during autoplay (OBS: uncheck *Capture Cursor*) or parked in a corner if you press the controls.
- Origin: the **final domain** with `ENVIRONMENT_LABEL` unset — the chip prefixes the tab title and sits by
  the logo (see `docs/final-domain-migration.md`). Recording on staging is fine for a dry run only.
- A **fresh passkey**: `Passport → sign out` (or a browser profile with none registered) so both prompts show.
  Passkeys are bound to the origin; a staging passkey does not exist on the final domain.
- A free front-row seat: the tier chip picks the front-most open seat nearest the centre, and every run
  consumes one, so the take lands on Row A · 14 / 16 / 13… — fine, but do not expect seat 15 again.
- Dry run once with the judge script on the same origin the night before: it prints the timings above and
  drops the reference frames (`apps/web/shots/judge-*.png`). If the relayer or the RPC is slow that night,
  you will see it there and not on camera.
- A live night, not an empty one: publish the capture event ("Turnstile Opening Night", a free tier and a
  paid one) about 30 minutes before recording, then `pnpm seed:night -- --relayer <origin> --event <address>`
  from `turnstile/` (add `--gate-token …` if the door is protected). It seeds a scattered crowd, two booths,
  one resale and six check-ins over ten minutes, so the organiser board, the pulse and the passports have
  rows; run it again with `--checkins 3 --minutes 3` just before the take for fresh arrivals. The tour lands
  on the newest free event, so the judge path lands on the seeded night without `?event=`.
- On the two prompts let the sheet sit for a beat before confirming; keep everything else moving.

## Scenes

"Take" is the position inside the recorded run; "Cut" is where it lands in the edit.

| # | Cut | Take | On screen | Voice-over (≈2.4 words/s) |
|---|-----|------|-----------|---------------------------|
| 1 | 0:00–0:08 | B-roll | Cold open: the city at night, beacons rising, camera drifting in. No UI (record `/` without `?tour` and trim, or `exit` the bar). | "Every beacon is a contract on Monad. Each one is a venue, and every seat in it is a ticket." |
| 2 | 0:08–0:16 | 0:00–0:03 + hold | Landing → `Judge mode` → the bar appears top-right, the free event's beacon pulses, cut into the club. | "Turnstile is identity-bound access: no wallet, no app, one passkey. This is the path a judge takes, timed on the bar." |
| 3 | 0:16–0:26 | 0:03–0:15 | Room overview — booths on the bottom edge, LED wall filling the top. Legend: amber open, cyan yours, green inside. The tier chip pulses, the front-row seat card says *Take this seat*. | "Amber is open. The chip finds the front row, nearest the centre." |
| 4 | 0:26–0:46 | 0:15–0:30 | Checkout panel bottom-left. **Passkey prompt 1** (buy). Receipt: `mint 800 ms` + hash on the bar. **Passkey prompt 2** (bind a door key). `bind 650 ms` + hash. Cutaway (3 s): the mint tx on the explorer. | "The passkey *is* the account. It signs the purchase; the relayer pays the gas. A second prompt binds a door key that exists only for tonight." |
| 5 | 0:46–1:02 | 0:30–0:38 + B-roll | The ticket: 41×41 QR, slot countdown ring beside it, `TS3:` code under it. Cutaway: one 30-second rollover (time-lapse B-roll, the code visibly changes), then the rendered ticket image from the metadata. | "The code re-signs itself every thirty seconds with that door key. A screenshot dies with the slot; a forward can't sign the next one." |
| 6 | 1:02–1:16 | 0:38–0:47 | `Walk up to the door` → gate view from the entrance; the bar moves to the bottom-left so the scanner owns the right edge. Code lands, *ready to admit*, **Admit**, the scanner turns green: `Go in. · Seat n · checked in 1.2 s`. Third hash. | "At the door, the gate recovers the signer from the code, checks it against the key bound on-chain, and submits the check-in from its own wallet." |
| 7 | 1:16–1:32 | 0:47–0:56 | Finale: cut back to the room, camera drops behind the seat, the **followspot** finds it and the floor ring rolls out — nothing else in the beam. Summary card: time, taps, two prompts, three hashes. | "Seat lit from chain state. One identity, two prompts, three transactions — well under a minute." |
| 8 | 1:32–1:48 | B-roll | `Explore the room` ends the tour; the lit seat stays selected and its card returns → *View from here* (the stage from the seat). Then the theatre event: stacked tiers, mezzanine rail, `from 0.006 MON`. | "Tiers, resale rules and door keys all come from the same contract — the theatre is the same code with a different room." |
| 9 | 1:48–2:00 | still | Closing card: repo URL, factory address, `Built on Monad · Mera passkeys`. | "Turnstile. Access that follows you." |

## B-roll list

Record these separately on the same origin, same window size, before or after the take.

| Clip | How | Used in |
|------|-----|---------|
| City drift, 12 s | `/` with no `?tour`, hands off; the camera drifts on its own | 1 |
| Mint tx page, 5 s | explorer link from the summary card (`EXPLORER_URL/tx/<hash>`) — the *from* is the relayer, the event is `TicketMinted` | 4 |
| QR rollover, 35 s → 7 s | stay on `/t/<event>/<seat>`; start ~5 s before the ring empties; speed ×5 in the edit | 5 |
| Ticket image, 4 s | `/api/events/1/tickets/<seat>/image.svg` in a fresh tab (the same SVG wallets and marketplaces show) | 5 |
| View from here, 8 s | after the finale press `Explore the room` (not the seat — clicking a selected seat deselects it), then *View from here* on the returned card; hold on the wall | 8 |
| Theatre flyover, 10 s | `/e/<theatre event>`; overview, then `View from here` on a mezzanine seat | 8 |
| Closing card | `apps/web/shots/judge-final.png` or the README hero with text over it | 9 |

## Frames to match

The judge script writes one frame per step — `judge-1-city.png`, `judge-2-pick.png`, `judge-3-checkout.png`,
`judge-4-ticket.png`, `judge-5-door.png`, `judge-6-lit.png` — and `judge-final.png` (the followspot). They are
the reference for framing and for the summary card; the recorded take should look the same minus the dev
chrome. `judge-5-door` catches the green `Go in.` only when the chain takes a moment to confirm (testnet
does); against anvil it can already be mid-cut back to the room.

## Notes for the edit

- No music under the voice-over during the passkey prompts; the silence sells that a system sheet is up.
- Keep every hash on screen long enough to be read; they are the proof. Subtitle the three of them with
  what they are (`mint`, `bind door key`, `check-in`) and link the explorer pages in the video description.
- Subtitle the two prompts ("passkey · buy", "passkey · bind door key") — viewers on mute should still count
  them.
- Do not speed up the run itself; the bar is on screen and a jump-cut in it reads as a cheat. Stretch with
  holds and cutaways only.
- End on the lit seat, not on the summary card; the card can be a picture-in-picture over it.
- If a take fails (RPC hiccup, mis-tap), `restart` on the bar starts a cold run — new passkey, same seat
  logic — without reloading; the bar's count starts over.
