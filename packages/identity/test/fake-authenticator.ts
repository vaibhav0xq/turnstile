// In-memory WebAuthn authenticator for unit tests, injected through Mera's `webAuthnClient`.
// Models exactly the properties the product relies on: PRF = HMAC(credential secret, salt) — deterministic
// per (credential, salt) and unrelated across salts — discoverable selection, allowCredential matching,
// prompt counting, and platform-style failures (DOMException names).

import type { WebAuthnClient } from "@category-labs/mera";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64urlnopad } from "@scure/base";

export type StoredCredential = {
  readonly id: Uint8Array;
  readonly secret: Uint8Array;
  readonly rpId: string;
  readonly userName: string;
  readonly transports: readonly string[];
};

const random = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));
const same = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export class FakeAuthenticator {
  /** Shared store lets two authenticators stand in for two devices with a synced passkey. */
  readonly store: StoredCredential[];
  /** Which stored credential answers a discoverable request; defaults to the most recently created. */
  selected: StoredCredential | null = null;
  prfSupported = true;
  /** When false, creation reports `prfEnabled` but no output — Mera then runs a fallback assertion (2 prompts). */
  prfOnCreate = true;
  /** DOMException name to throw on the next ceremony (simulates a dismissed sheet, etc.). */
  failNextWith: string | null = null;
  prompts = 0;
  readonly client: WebAuthnClient;

  constructor(store: StoredCredential[] = []) {
    this.store = store;
    this.selected = store.at(-1) ?? null;
    this.client = {
      createCredential: async (request) => {
        this.prompt();
        const credential: StoredCredential = {
          id: random(16),
          secret: random(32),
          rpId: request.rp.id,
          userName: request.user.name,
          transports: ["internal", "hybrid"],
        };
        this.store.push(credential);
        this.selected = credential;
        const prfOutput =
          this.prfSupported && this.prfOnCreate ? this.prf(credential, request.prfSalt) : undefined;
        return {
          credentialId: new Uint8Array(credential.id),
          transports: [...credential.transports],
          prfEnabled: this.prfSupported,
          ...(prfOutput !== undefined ? { prfOutput } : {}),
        };
      },
      getCredential: async (request) => {
        this.prompt();
        const candidates = this.store.filter((c) => c.rpId === request.rpId);
        const credential = request.allowCredential
          ? candidates.find((c) => same(c.id, request.allowCredential?.credentialId ?? new Uint8Array()))
          : this.selected && candidates.includes(this.selected)
            ? this.selected
            : candidates.at(-1);
        if (!credential) {
          throw new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
        }
        return {
          credentialId: new Uint8Array(credential.id),
          ...(this.prfSupported ? { prfOutput: this.prf(credential, request.prfSalt) } : {}),
        };
      },
    };
  }

  /** hmac-secret semantics: output depends on the credential's secret and the salt only. */
  prf(credential: StoredCredential, salt: Uint8Array): Uint8Array {
    return hmac(sha256, credential.secret, salt);
  }

  idOf(credential: StoredCredential): string {
    return base64urlnopad.encode(credential.id);
  }

  private prompt(): void {
    this.prompts++;
    if (this.failNextWith) {
      const name = this.failNextWith;
      this.failNextWith = null;
      throw new DOMException(`simulated ${name}`, name);
    }
  }
}
