# Demo video — storyboard

Target: **under two minutes**, one continuous run of judge mode against the Monad testnet deployment, with a
short cold open and a closing card. The run itself is ~35 s on the tour bar; the rest is context. Everything
shown is real: three transactions land on testnet during the take.

## Capture

- Browser at **1920×1080**, 100 % zoom, no extensions, dark OS theme. Record the tab (OBS window capture or
  Chrome's own `chrome://` tab recorder), 60 fps, system audio off. Add the voice-over afterwards.
- URL: `<final origin>/?tour=auto` for a hands-free take, or `/?tour=1` if you want to press the controls on
  camera (the bar counts the taps either way). Use a **fresh passkey** (`New passkey` → sign out first) so
  both prompts show up; the platform prompt is the point.
- The staging chip (`ENVIRONMENT_LABEL`) must be **off** on the origin you record — it prefixes the tab title
  and sits next to the logo.
- Dry-run first: `pnpm --filter @turnstile/web run judge -- --base <origin>` (real WebAuthn through a virtual
  authenticator) prints the per-step timings and drops frames in `apps/web/shots/` you can compare against.
- Keep the cursor still between presses. On the checkout and ticket steps the passkey sheet is the action —
  let it breathe for a second before confirming.

## Scenes

| # | Time | On screen | Voice-over |
|---|------|-----------|------------|
| 1 | 0:00–0:08 | Cold open: the city at night, camera drifting in over the beacons. No UI yet (start the run, hide the bar with `exit` if needed, or trim the first second). | "Every beacon is a contract on Monad. Each one is a venue, and every seat in it is a ticket." |
| 2 | 0:08–0:18 | Landing → `Judge mode` → the bar appears. The free event's beacon pulses; the camera cuts into the club. | "Turnstile is identity-bound access: no wallet, no app, one passkey. This is the two-minute path a judge takes, timed on the bar." |
| 3 | 0:18–0:30 | Room overview. Legend: amber open, cyan yours, green inside. The tier chip picks the best open seat; the card says *Take this seat*. | "Amber is open. The chip finds the front row, nearest the centre." |
| 4 | 0:30–0:48 | Checkout. **Passkey prompt 1** (buy). Receipt line: mint hash and milliseconds. **Passkey prompt 2** (bind a door key). Second hash. | "The passkey *is* the account. It signs the purchase; the relayer pays the gas. A second prompt binds a door key that exists only for tonight." |
| 5 | 0:48–1:02 | The ticket. The QR (41×41, base45) with the slot countdown beside it. Hold through one 30-second rollover if the take allows — the code visibly changes. | "The code re-signs itself every thirty seconds with that door key. A screenshot dies with the slot; a forward can't sign the next one." |
| 6 | 1:02–1:18 | `Walk up to the door` → the gate view from the entrance. The code lands in the scanner; *ready to admit*; **Admit**. Third hash. | "At the door, the gate recovers the signer from the code, checks it against the key bound on-chain, and submits the check-in from its own wallet." |
| 7 | 1:18–1:35 | Finale: cut back to the room, camera drops behind the seat, the **followspot** finds it and the floor ring rolls out. Summary card: time, taps, two prompts, three hashes. | "Seat lit from chain state. One identity, two prompts, three transactions — under a minute." |
| 8 | 1:35–1:50 | Optional second angle: click the seat → *View from here* (the stage from the seat), then `Explore the room`. Or the theatre event for range. | "Tiers, resale rules and door keys are all derived from the same contract — the theatre is the same code with a different room." |
| 9 | 1:50–2:00 | Closing card (static frame or the README hero): repo URL, testnet factory address, `Built on Monad · Mera passkeys`. | "Turnstile. Access that follows you." |

## Frames to match

`pnpm --filter @turnstile/web run judge` writes one frame per step (`judge-1-city.png` … `judge-5-lit.png`,
`judge-final.png`). Use them as the reference for framing and for the summary card; the recorded take should
look the same minus the dev chrome.

## Notes for the edit

- No music under the voice-over during the passkey prompts; the silence sells that a system sheet is up.
- Keep every hash on screen long enough to be read; they are the proof.
- Subtitle the two prompts ("passkey · buy", "passkey · bind door key") — viewers on mute should still count
  them.
- End on the lit seat, not on the summary card; the card can be a picture-in-picture over it.
