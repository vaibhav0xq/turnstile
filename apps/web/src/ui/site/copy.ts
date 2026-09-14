// The public site's words, in one place so the claims stay consistent with the product rules: codes are
// valid for about a minute (never "screenshots don't work"), notes are private but attendance is public,
// and nothing here promises what the deployment cannot show.

export const REPO_URL = "https://github.com/vaibhav0xq/turnstile";
export const DOCS_URL = `${REPO_URL}/tree/main/docs`;
export const CONTRACTS_URL = `${REPO_URL}/tree/main/packages/contracts`;
export const IDENTITY_SPEC_URL = `${REPO_URL}/blob/main/packages/identity/SPEC.md`;

export interface Frame {
  numeral: string;
  title: string;
  body: string;
  still: { src: string; alt: string };
}

/** How it works — three stills from the judge run, in the order a fan meets them. */
export const FRAMES: Frame[] = [
  {
    numeral: "I",
    title: "Pick a seat",
    body: "The venue is the seat map. Tap a seat in the room and the card tells you the row, the price and whether it is yours, taken or listed.",
    still: { src: "/site/pick.jpg", alt: "The theatre in 3D with one seat selected and its card open" },
  },
  {
    numeral: "II",
    title: "Your passkey signs",
    body: "One prompt. The seat is minted to an address derived from your passkey — nothing to install, no seed phrase. Free seats, door keys and listings are sponsored by the relayer; a paid seat costs its face value from your passkey's own account.",
    still: { src: "/site/sign.jpg", alt: "The checkout panel: passkey, seat, door key, one button" },
  },
  {
    numeral: "III",
    title: "The door reads a 30-second code",
    body: "Your ticket shows a code signed by a key that exists only for that event. The door scans it, the chain confirms, and your seat lights up in the room.",
    still: {
      src: "/site/door.jpg",
      alt: "A ticket with its rotating door code and the seconds left in the slot",
    },
  },
];

export interface Point {
  title: string;
  body: string;
}

/** Why identity-bound — the honest version of each claim. */
export const WHY: Point[] = [
  {
    title: "A copied code goes stale within a minute.",
    body: "Codes rotate every 30 seconds and the door accepts the current slot and one either side. A seat admits once. So a screenshot is worth at most one early entry — which the holder sees on their own ticket — never a second person inside.",
  },
  {
    title: "Only the passkey that holds the seat can produce the code.",
    body: "The door key is derived from your passkey for that event alone and bound to the seat on-chain. A forwarded code is stale within a minute, and the ticket itself cannot leave your account except through resale — so there is nothing to sell twice.",
  },
  {
    title: "Resale on the organiser's terms.",
    body: "A listing can ask at most the organiser's cap (a percentage of face value), and a fee from every resale goes back to them. When a seat sells, the old door key is dropped and the buyer's passkey binds its own.",
  },
  {
    title: "Private notes, public attendance.",
    body: "Your passport notes live in a vault encrypted with a key only your passkey can derive; the relayer stores the blob and cannot read it. Your attendance is on-chain like any ticket, and the Live layer shows it by address.",
  },
];

export const ORGANISER_POINTS = [
  "Publish from a passkey — the same prompt fans use; no wallet extension on the box-office laptop.",
  "Choose a room: the club or the theatre. Seats, rows and tiers come with it.",
  "Set tiers, prices, capacity, the resale cap and your fee. Free doors are fine.",
  "Hand the door a gate key. Scanning runs in any browser; check-ins land on-chain.",
  "Watch the door board fill in live: inside, sold, resales, last check-in.",
];

export interface Faq {
  q: string;
  a: string;
}

export const FAQ: Faq[] = [
  {
    q: "Is this a wallet?",
    a: "No. A passkey is your account. It lives in your phone's or laptop's authenticator and syncs the way your passwords do; Turnstile derives keys from it and you never see a seed phrase. Underneath, every seat is an on-chain ticket held by an address only your passkey controls.",
  },
  {
    q: "What if I lose my phone?",
    a: "If your passkey syncs through your platform account (iCloud Keychain, Google Password Manager, a password manager), sign in on the new device and the same passkey derives the same keys: same account, same seats, same vault. A device-bound passkey that never synced is lost with the device, like any key — so use a syncing authenticator for seats you care about. The relayer keeps nothing that only the old phone had.",
  },
  {
    q: "What happens if someone copies my QR?",
    a: "The code changes every 30 seconds and the door accepts the current slot and one either side, so a copy is useful for about a minute. A seat admits once: if a copy gets in first, your own ticket shows the seat as already inside. A copied code is one early entry at most, never two people on one seat.",
  },
  {
    q: "What does the venue see?",
    a: "At the door: that the code was produced by the key bound to a valid seat for tonight, and whether that seat is already inside. On the board: counts and check-ins by seat. Never your notes — those are encrypted with a key the relayer cannot derive. Your on-chain history is public by address, as with any ticket contract.",
  },
  {
    q: "Can I resell?",
    a: "If the organiser allows it. List from your ticket at up to the organiser's cap on face value; the organiser's fee comes off the sale; the buyer's passkey becomes the holder and binds a new door key. Outside of resale the ticket cannot be transferred at all — that is what identity-bound means.",
  },
  {
    q: "Does it cost gas?",
    a: "Mostly not. Free seats and every holder action — binding the door key, listing, delisting, walking in — go through an ERC-2771 forwarder: your passkey signs, the relayer submits and pays the gas. A paid seat is bought from your passkey's own account, so it costs its face value in MON plus that one transaction's gas; on the testnet a small drip funds a first purchase.",
  },
];
