// @turnstile/identity — one passkey, many keys.
//
//   createIdentity / signIn        → account namespace  → 15-minute AccountSession (viem LocalAccount)
//   deriveDoorKey(event)           → presence namespace → per-event DoorSession that signs EIP-712 Entry codes
//   openVault                      → vault namespace    → AES-256-GCM Vault for the private passport
//   withAccountSession             → run relayed calls against a live session, with designed failure states
//   exportRecoveryPhrase           → the account as a BIP-39 phrase (MetaMask / Rabby import)
//
// Pure sub-modules (no WebAuthn) are also exposed as subpaths: ./entry, ./bind, ./kdf, ./vault, ./errors.
// The behaviour is frozen in SPEC.md and pinned by vectors/*.json.

export * from "./bind.ts";
export * from "./constants.ts";
export { b64u, fromHex, toHex, zeroize } from "./encoding.ts";
export * from "./entry.ts";
export * from "./errors.ts";
export * from "./identity.ts";
export * from "./kdf.ts";
export * from "./vault.ts";
