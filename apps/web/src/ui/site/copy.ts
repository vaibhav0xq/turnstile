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

/**
 * The three frames of the landing's flight, in the order a fan meets them: each pairs a still from the judge
 * run with the one thing to know at that point. Also the "How it works" of the site.
 */
export const FRAMES: Frame[] = [
  {
    numeral: "I",
    title: "Choose from the room.",
    body: "Every seat shows its row, price and live availability.",
    still: { src: "/site/pick.jpg", alt: "The theatre in 3D with one seat selected and its card open" },
  },
  {
    numeral: "II",
    title: "Your passkey is the account.",
    body: "Free actions are relayed. Paid seats use your Monad account. No wallet or app.",
    still: { src: "/site/sign.jpg", alt: "The checkout panel: passkey, seat, door key, one button" },
  },
  {
    numeral: "III",
    title: "The door checks a rotating code.",
    body: "A per-event door key signs each code. Every seat can check in once.",
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
    title: "Copied codes expire.",
    body: "Codes rotate every 30 seconds and remain valid for about a minute. Each seat admits once.",
  },
  {
    title: "The holder produces the code.",
    body: "A separate per-event door key is derived from the holder's passkey and bound on-chain.",
  },
  {
    title: "Resale follows organiser terms.",
    body: "The contract caps prices and returns the organiser's fee. Buyers bind a new door key.",
  },
  {
    title: "Private notes, public attendance.",
    body: "Passport notes are passkey-encrypted. Ticket ownership and attendance remain public on-chain by address.",
  },
];

export const ORGANISER_POINTS = [
  "Publish from a passkey. No wallet extension is required.",
  "Choose the club or theatre with its seats, rows and tiers.",
  "Set prices, capacity, the resale cap and your fee.",
  "Use the gate key in any browser. Check-ins land on-chain.",
  "Follow attendance, sales and resales on the live door board.",
];

export interface Faq {
  q: string;
  a: string;
}

export const FAQ: Faq[] = [
  {
    q: "Is this a wallet?",
    a: "No. Your passkey is the account. It controls the address holding each on-chain ticket without a wallet, app or seed phrase.",
  },
  {
    q: "What if I lose my phone?",
    a: "A synced passkey restores the same account, seats and vault on another device. A device-bound passkey that was never synced is lost with that device.",
  },
  {
    q: "What happens if someone copies my QR?",
    a: "Codes rotate every 30 seconds and remain valid for about a minute. Each seat admits once, so a copy cannot admit a second person.",
  },
  {
    q: "What does the venue see?",
    a: "The venue sees valid seats, check-ins and public on-chain history by address. It cannot read passport notes encrypted under your vault key.",
  },
  {
    q: "Can I resell?",
    a: "If enabled, list within the organiser's price cap. The contract returns their fee. The buyer becomes the holder and binds a new door key.",
  },
  {
    q: "Does it cost gas?",
    a: "The relayer sponsors free seats, door keys, resale actions and check-ins. Paid seats cost their MON price plus transaction gas from your passkey account.",
  },
];
