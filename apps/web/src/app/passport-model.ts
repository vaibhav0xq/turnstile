// The private passport's plaintext: what a fan keeps for themselves across devices. Encrypted with the vault
// key before it leaves the browser (identity SPEC §4.4), synced through the relayer (§4.6). Pure functions
// here; the store in passport.ts drives the ceremonies.

export const PASSPORT_VERSION = 1;
export const NAME_MAX = 40;
export const NOTE_MAX = 280;

export interface PassportNote {
  text: string;
  /** Unix ms of the last edit. */
  at: number;
}

export interface Passport {
  v: typeof PASSPORT_VERSION;
  /** What the passport calls its holder. Never leaves the browser in clear. */
  name: string;
  /** Per-ticket memories keyed by `noteKey()`. */
  notes: Record<string, PassportNote>;
}

export function emptyPassport(): Passport {
  return { v: PASSPORT_VERSION, name: "", notes: {} };
}

/** A ticket is one seat of one event on one chain; the key survives resales because it is not the holder. */
export function noteKey(chainId: number, eventAddress: string, tokenId: number): string {
  return `${chainId}:${eventAddress.toLowerCase()}:${tokenId}`;
}

/** Accepts what a previous version of the app (or a hand-edited blob) may have stored; drops the rest. */
export function parsePassport(input: unknown): Passport {
  const out = emptyPassport();
  if (!input || typeof input !== "object") return out;
  const raw = input as { name?: unknown; notes?: unknown };
  if (typeof raw.name === "string") out.name = raw.name.trim().slice(0, NAME_MAX);
  if (raw.notes && typeof raw.notes === "object") {
    for (const [key, value] of Object.entries(raw.notes as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const note = value as { text?: unknown; at?: unknown };
      if (typeof note.text !== "string" || note.text.trim() === "") continue;
      out.notes[key] = {
        text: note.text.trim().slice(0, NOTE_MAX),
        at: typeof note.at === "number" && Number.isFinite(note.at) ? note.at : 0,
      };
    }
  }
  return out;
}

/** Returns a new passport with the note set (or removed when the text is blank). Edits keep the raw text so
 * typing is not fought; `parsePassport` trims when the passport is saved or loaded. */
export function withNote(passport: Passport, key: string, text: string, now: number): Passport {
  const notes = { ...passport.notes };
  const next = text.slice(0, NOTE_MAX);
  if (next.trim() === "") delete notes[key];
  else if (notes[key]?.text !== next) notes[key] = { text: next, at: now };
  return { ...passport, notes };
}

export function withName(passport: Passport, name: string): Passport {
  return { ...passport, name: name.slice(0, NAME_MAX) };
}

/** Equal once trimmed — a trailing space is not a change worth a signature. */
export function samePassport(a: Passport, b: Passport): boolean {
  if (a.name.trim() !== b.name.trim()) return false;
  const ka = Object.keys(a.notes).sort();
  const kb = Object.keys(b.notes).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && a.notes[k]?.text.trim() === b.notes[k]?.text.trim());
}
