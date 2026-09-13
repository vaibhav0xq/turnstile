// Turnstile — Mera / passkey spike (throwaway, client-only).
// Proves: one passkey → (1) account namespace → EVM account, (2) presence namespace →
// per-event door key that signs an EIP-712 Entry and verifies, (3) vault namespace →
// AES-256-GCM key that encrypts/decrypts a private passport, (4) the same three results
// on a second device / after clearing storage, from the passkey alone.

import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
  isMeraError,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hashTypedData, verifyTypedData, recoverTypedDataAddress } from "viem";
import qrcode from "qrcode-generator";

// ---------------------------------------------------------------- constants
const RP_ID = location.hostname;
const RP_NAME = "Turnstile spike";
const utf8 = (s) => new TextEncoder().encode(s);

// PRF salt namespaces. Each salt is an isolated PRF namespace (output = f(credential, rpId, salt)).
// Account namespace uses Mera's default salt (sha256("mera.prf.salt.v1")) so the account stays
// portable and matches Mera's documented derivation.
const PRESENCE_SALT = sha256(utf8("turnstile/presence/v1"));
const VAULT_SALT = sha256(utf8("turnstile/vault/v1"));

// Sample event used for the door-key derivation and the Entry typed data.
const SAMPLE_EVENT = {
  chainId: 10143, // Monad testnet
  eventAddress: "0x000000000000000000000000000000000000E0E1", // placeholder TurnstileEvent
  eventId: 1n,
  tokenId: 42n,
};

const ENTRY_TYPES = {
  Entry: [
    { name: "eventId", type: "uint256" },
    { name: "tokenId", type: "uint256" },
    { name: "slot", type: "uint64" },
  ],
};
const SLOT_MS = 30_000;

const LS_CREDENTIAL = "turnstile.spike.credential"; // convenience only — never required
const LS_VAULT = "turnstile.spike.vault"; // stands in for untrusted server storage

// How the presence/vault ceremonies address the passkey:
//   discoverable   — no allowCredentials; the authenticator picks; we verify the SAME passkey answered by credential id
//   id             — allowCredentials: [{ id }] (what the app has after a discoverable sign-in: assertions carry no transports)
//   id+transports  — allowCredentials: [{ id, transports }] (transports from creation, from the link, or ["internal","hybrid"])
const MODES = ["discoverable", "id", "id+transports"];
const DEFAULT_TRANSPORTS = ["internal", "hybrid"];

// ---------------------------------------------------------------- state
const state = {
  credential: loadCredential(),
  accountSession: null,
  accountAddress: null,
  doorSession: null,
  doorAddress: null,
  vaultKey: null,
  blob: localStorage.getItem(LS_VAULT) || null,
  signature: null,
  expected: parseExpected(),
  results: { steps: {}, matches: {}, namespaces: { presence: {}, vault: {} } },
};

function loadCredential() {
  try {
    const raw = localStorage.getItem(LS_CREDENTIAL);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
function saveCredential(meta) {
  state.credential = meta;
  localStorage.setItem(LS_CREDENTIAL, JSON.stringify(meta));
}
// After an assertion we only learn the credential id (transports exist on attestation responses only).
// Keep transports we already know for that id — from creation on this device or from device A's link.
function rememberCredential(credentialId) {
  const known = [state.credential, state.expected?.credential].find((c) => c?.credentialId === credentialId);
  saveCredential({ credentialId, ...(known?.transports ? { transports: known.transports } : {}) });
}
function knownCredential() {
  return state.credential || state.expected?.credential || null;
}
function credentialFor(mode) {
  if (mode === "discoverable") return undefined;
  const known = knownCredential();
  if (!known) throw new Error(`mode "${mode}" needs a credential id — sign in first (or open a link that carries c=)`);
  if (mode === "id") return { credentialId: known.credentialId };
  return { credentialId: known.credentialId, transports: known.transports || state.expected?.credential?.transports || DEFAULT_TRANSPORTS };
}
function currentMode() {
  const v = $("prfmode")?.value;
  return MODES.includes(v) ? v : "discoverable";
}
function parseExpected() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get("a")) return null;
  const credential = h.get("c") ? { credentialId: h.get("c"), ...(h.get("t") ? { transports: h.get("t").split(",") } : {}) } : null;
  return { account: h.get("a"), door: h.get("d"), blob: h.get("v"), credential };
}

// ---------------------------------------------------------------- helpers
const b64u = {
  enc: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};
const $ = (id) => document.getElementById(id);
const short = (a) => (a ? a.slice(0, 8) + "…" + a.slice(-6) : "—");

function setStatus(id, text, kind = "info") {
  const el = $(id);
  el.textContent = text;
  el.dataset.kind = kind;
}
function record(step, ok, ms, extra = {}) {
  state.results.steps[step] = { ok, ms: Math.round(ms), ...extra };
  renderReport();
}
function describeError(e) {
  if (isMeraError(e)) {
    const hint = {
      PRF_UNAVAILABLE: "This authenticator does not expose the WebAuthn PRF extension. Use a phone (iOS 18 Safari, Android Chrome with Google Password Manager) or a desktop Chrome signed into Google Password Manager.",
      PASSKEY_OPERATION_FAILED: "WebAuthn failed or was cancelled (also thrown when the origin is not a secure context).",
      SESSION_ENDED: "Signing session already ended — sign in again.",
      DECRYPT_FAILED: "Wrong key or tampered ciphertext.",
    }[e.code];
    return `${e.code}: ${e.message}${hint ? " — " + hint : ""}`;
  }
  return `${e?.name || "Error"}: ${e?.message || String(e)}`;
}
// Mera wraps the WebAuthn DOMException as `cause`. Its name (NotAllowedError / SyntaxError / InvalidStateError /
// NotSupportedError / SecurityError / AbortError) and the elapsed time are the two facts that separate
// "the sheet never appeared" from "the sheet appeared and the user or platform cancelled".
function errorInfo(e) {
  const cause = e?.cause;
  return {
    error: describeError(e),
    ...(cause ? { cause: { name: cause.name || typeof cause, message: cause.message || String(cause), ...(cause.code !== undefined ? { code: cause.code } : {}) } } : {}),
  };
}
function failText(info, ms) {
  return `${info.error}${info.cause ? ` [${info.cause.name}: ${info.cause.message}]` : ""} · failed after ${Math.round(ms)} ms`;
}
async function timed(fn) {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - t0 };
}
function recordNamespace(ns, mode, summary) {
  state.results.namespaces[ns][mode] = { ...summary, ms: Math.round(summary.ms) };
  renderReport();
}
// One PRF ceremony against a namespace salt, in the chosen addressing mode. Also answers "did the SAME passkey
// as sign-in answer?" by comparing credential ids — the check the app will enforce instead of relying on allowCredentials.
async function namespaceAssertion(salt, mode) {
  const credential = credentialFor(mode);
  const t0 = performance.now();
  const value = await getPasskeyPrfOutput({ rpId: RP_ID, credential, prfSalt: salt });
  const ms = performance.now() - t0;
  const ref = knownCredential()?.credentialId || null;
  const sameCredential = ref ? value.credentialId === ref : null;
  if (!ref) rememberCredential(value.credentialId);
  return { prfOutput: value.prfOutput, credentialId: value.credentialId, ms, mode, sameCredential };
}
function sameText(r) {
  return r.sameCredential === false ? " · ⚠️ a DIFFERENT passkey answered than the one you signed in with" : r.sameCredential ? " · same passkey as sign-in ✓" : "";
}

// ---------------------------------------------------------------- derivations
// Account namespace → BIP-39/BIP-44 m/44'/60'/0'/0/0 (Mera's documented derivation, portable to MetaMask/Rabby).
function accountFromPrf(prfOutput) {
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!node.privateKey) throw new Error("derivation produced no key");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  node.wipePrivateData();
  seed.fill(0);
  prfOutput.fill(0);
  return session;
}

// Presence namespace → HKDF per event → secp256k1 door key. Never funded, never an account.
function doorKeyFromPrf(prfOutput, { chainId, eventAddress }) {
  for (let counter = 0; counter < 8; counter++) {
    const info = utf8(`turnstile/door/v1|${chainId}|${eventAddress.toLowerCase()}|${counter}`);
    const key = hkdf(sha256, prfOutput, utf8("turnstile/door-key/v1"), info, 32);
    try {
      const session = createSecp256k1SigningSession({ privateKey: key });
      key.fill(0);
      prfOutput.fill(0);
      return session;
    } catch (e) {
      key.fill(0);
      if (!(isMeraError(e) && e.code === "INPUT_INVALID")) throw e; // invalid scalar (p≈2^-128) → next counter
    }
  }
  throw new Error("no valid scalar after 8 attempts");
}

// Vault namespace → HKDF → AES-256-GCM key (non-extractable CryptoKey).
async function vaultKeyFromPrf(prfOutput) {
  const raw = hkdf(sha256, prfOutput, utf8("turnstile/vault-key/v1"), utf8("passport"), 32);
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  raw.fill(0);
  prfOutput.fill(0);
  return key;
}
const VAULT_AAD = utf8("turnstile/passport/v1");
async function encryptBlob(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: VAULT_AAD }, key, utf8(JSON.stringify(obj))));
  return `v1.${b64u.enc(iv)}.${b64u.enc(ct)}`;
}
async function decryptBlob(key, blob) {
  const [v, iv, ct] = blob.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("bad blob format");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u.dec(iv), additionalData: VAULT_AAD }, key, b64u.dec(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---------------------------------------------------------------- steps
async function stepCreate() {
  setStatus("s1", "Creating passkey… (one prompt; some authenticators show a second)");
  const t0 = performance.now();
  try {
    const { value, ms } = await timed(() =>
      createPasskeyWithPrfOutput({
        rp: { id: RP_ID, name: RP_NAME },
        user: { name: `fan-${Date.now().toString(36)}@turnstile`, displayName: "Turnstile fan" },
      }),
    );
    saveCredential({ credentialId: value.credentialId, transports: value.transports });
    installAccount(accountFromPrf(value.prfOutput));
    setStatus("s1", `Passkey created in ${Math.round(ms)} ms · credentialId ${short(value.credentialId)} · transports ${JSON.stringify(value.transports ?? null)}`, "ok");
    record("create", true, ms, { credentialId: value.credentialId, transports: value.transports });
  } catch (e) {
    const ms = performance.now() - t0;
    const info = errorInfo(e);
    setStatus("s1", failText(info, ms), "err");
    record("create", false, ms, info);
  }
}

async function stepSignIn(discoverable = false) {
  const credential = discoverable ? undefined : state.credential;
  setStatus("s2", credential ? "Signing in with the stored credential id…" : "Signing in — pick any passkey for this site (discoverable)…");
  const t0 = performance.now();
  try {
    const { value, ms } = await timed(() => getPasskeyPrfOutput({ rpId: RP_ID, credential }));
    rememberCredential(value.credentialId);
    installAccount(accountFromPrf(value.prfOutput));
    let msg = `Signed in in ${Math.round(ms)} ms${credential ? "" : " (discoverable, nothing stored)"} · credentialId ${short(value.credentialId)}`;
    if (state.expected?.account) {
      const match = state.expected.account.toLowerCase() === state.accountAddress.toLowerCase();
      state.results.matches.account = match;
      msg += match ? " · ✅ same account as device A" : " · ❌ DIFFERENT account than device A";
    }
    if (state.expected?.credential) {
      const same = state.expected.credential.credentialId === value.credentialId;
      state.results.matches.credentialId = same;
      msg += same ? " · same credential id as device A ✓" : " · ⚠️ credential id differs from device A (different passkey)";
    }
    setStatus("s2", msg, "ok");
    record("signin", true, ms, { discoverable: !credential, credentialId: value.credentialId });
  } catch (e) {
    const ms = performance.now() - t0;
    const info = errorInfo(e);
    setStatus("s2", failText(info, ms), "err");
    record("signin", false, ms, { discoverable: !credential, ...info });
  }
}

function installAccount(session) {
  state.accountSession?.end();
  state.accountSession = session;
  state.accountAddress = toViemAccount(session).address;
  $("account").textContent = state.accountAddress;
  renderReport();
}

async function stepDoorKey(modeOverride) {
  const mode = modeOverride || currentMode();
  setStatus("s3", `Evaluating presence namespace [${mode}]… (this prompt is the point: presence = a fresh biometric)`);
  const t0 = performance.now();
  try {
    const r = await namespaceAssertion(PRESENCE_SALT, mode);
    state.doorSession?.end();
    state.doorSession = doorKeyFromPrf(r.prfOutput, SAMPLE_EVENT);
    state.doorAddress = toViemAccount(state.doorSession).address;
    $("door").textContent = state.doorAddress;
    let msg = `Door key derived in ${Math.round(r.ms)} ms [${mode}] for event ${SAMPLE_EVENT.eventAddress} on chain ${SAMPLE_EVENT.chainId}${sameText(r)}`;
    if (state.expected?.door) {
      const match = state.expected.door.toLowerCase() === state.doorAddress.toLowerCase();
      state.results.matches.door = match;
      msg += match ? " · ✅ same door key as device A" : " · ❌ DIFFERENT door key than device A";
    }
    setStatus("s3", msg, "ok");
    record("door", true, r.ms, { mode, sameCredential: r.sameCredential });
    recordNamespace("presence", mode, { ok: true, ms: r.ms, sameCredential: r.sameCredential });
  } catch (e) {
    const ms = performance.now() - t0;
    const info = errorInfo(e);
    setStatus("s3", failText(info, ms), "err");
    record("door", false, ms, { mode, ...info });
    recordNamespace("presence", mode, { ok: false, ms, ...info });
  }
}

async function stepEntry() {
  if (!state.doorSession) return setStatus("s4", "Derive the door key first.", "err");
  setStatus("s4", "Signing Entry typed data with the door key (no prompt — in-memory session)…");
  try {
    const slot = BigInt(Math.floor(Date.now() / SLOT_MS));
    const typed = {
      domain: { name: "Turnstile", version: "1", chainId: SAMPLE_EVENT.chainId, verifyingContract: SAMPLE_EVENT.eventAddress },
      types: ENTRY_TYPES,
      primaryType: "Entry",
      message: { eventId: SAMPLE_EVENT.eventId, tokenId: SAMPLE_EVENT.tokenId, slot },
    };
    const account = toViemAccount(state.doorSession);
    const { value: signature, ms } = await timed(() => account.signTypedData(typed));
    const digest = hashTypedData(typed);
    const recovered = await recoverTypedDataAddress({ ...typed, signature });
    const valid = await verifyTypedData({ ...typed, address: state.doorAddress, signature });
    state.signature = { slot: slot.toString(), digest, signature, recovered, valid };
    $("entry").textContent = `slot ${slot}\ndigest ${digest}\nsig ${signature}\nrecovered ${recovered}`;
    setStatus("s4", valid ? `✅ signature verifies against the door key (${Math.round(ms)} ms). ecrecover(digest, sig) == doorKey — exactly what checkIn() will do onchain.` : "❌ verification failed", valid ? "ok" : "err");
    record("entry", valid, ms);
  } catch (e) {
    setStatus("s4", describeError(e), "err");
    record("entry", false, 0, { error: describeError(e) });
  }
}

async function stepVaultKey(modeOverride) {
  const mode = modeOverride || currentMode();
  setStatus("s5", `Evaluating vault namespace [${mode}]…`);
  const t0 = performance.now();
  try {
    const r = await namespaceAssertion(VAULT_SALT, mode);
    state.vaultKey = await vaultKeyFromPrf(r.prfOutput);
    setStatus("s5", `Vault key ready in ${Math.round(r.ms)} ms [${mode}] (AES-256-GCM, non-extractable, in memory only)${sameText(r)}`, "ok");
    record("vaultKey", true, r.ms, { mode, sameCredential: r.sameCredential });
    recordNamespace("vault", mode, { ok: true, ms: r.ms, sameCredential: r.sameCredential });
    return true;
  } catch (e) {
    const ms = performance.now() - t0;
    const info = errorInfo(e);
    setStatus("s5", failText(info, ms), "err");
    record("vaultKey", false, ms, { mode, ...info });
    recordNamespace("vault", mode, { ok: false, ms, ...info });
    return false;
  }
}

// Runs the vault namespace in all three addressing modes back-to-back (three prompts). Isolates the variable:
// if `discoverable` passes and `id` fails on a platform, that platform rejects allowCredentials for this passkey
// and the app must address namespaces discoverably + verify by credential id.
async function probeVault() {
  if (!knownCredential()) return setStatus("s5p", "Sign in first (step 2) so the by-id modes know which credential to name.", "err");
  for (const mode of MODES) {
    setStatus("s5p", `Probe ${MODES.indexOf(mode) + 1}/3 · ${mode}… approve the prompt`);
    await stepVaultKey(mode);
  }
  setStatus("s5p", `Probe done — ${probeSummary("vault")}`, "ok");
}
function probeSummary(ns) {
  const r = state.results.namespaces[ns];
  return MODES.map((m) => `${m}: ${!r[m] ? "·" : r[m].ok ? `✅ ${r[m].ms} ms${r[m].sameCredential === false ? " (other passkey!)" : ""}` : `❌ ${r[m].cause?.name || r[m].error} @ ${r[m].ms} ms`}`).join(" · ");
}

async function stepEncrypt() {
  if (!state.vaultKey) return setStatus("s5b", "Derive the vault key first.", "err");
  try {
    const passport = {
      kind: "turnstile.private-passport",
      owner: state.accountAddress,
      stubs: [{ event: "Sample Club Night", seat: "GA-042", plusOne: "R. Mehta", note: "first row, right of the booth" }],
      createdAt: new Date().toISOString(),
    };
    const { value: blob, ms } = await timed(() => encryptBlob(state.vaultKey, passport));
    state.blob = blob;
    localStorage.setItem(LS_VAULT, blob); // "untrusted storage" — ciphertext only
    $("blob").value = blob;
    setStatus("s5b", `Encrypted ${blob.length} chars in ${Math.round(ms)} ms. The blob is safe to store anywhere — it is useless without the passkey.`, "ok");
    record("encrypt", true, ms);
  } catch (e) {
    setStatus("s5b", describeError(e), "err");
    record("encrypt", false, 0, { error: describeError(e) });
  }
}

async function stepDecrypt() {
  if (!state.vaultKey) return setStatus("s5c", "Derive the vault key first.", "err");
  const blob = $("blob").value.trim() || state.blob || state.expected?.blob;
  if (!blob) return setStatus("s5c", "No blob to decrypt — encrypt one or paste one from device A.", "err");
  try {
    const { value, ms } = await timed(() => decryptBlob(state.vaultKey, blob));
    $("plain").textContent = JSON.stringify(value, null, 2);
    const fromA = !!state.expected?.blob && blob === state.expected.blob;
    if (fromA) state.results.matches.vault = true;
    setStatus("s5c", `✅ decrypted in ${Math.round(ms)} ms${fromA ? " — the blob from device A opens on this device" : ""}`, "ok");
    record("decrypt", true, ms, { fromDeviceA: fromA });
  } catch (e) {
    if (state.expected?.blob) state.results.matches.vault = false;
    const msg = e?.name === "OperationError" ? "DECRYPT_FAILED: AES-GCM authentication failed (different passkey/namespace, or tampered blob)" : describeError(e);
    setStatus("s5c", msg, "err");
    record("decrypt", false, 0, { error: msg });
  }
}

function linkParams() {
  const p = new URLSearchParams({ a: state.accountAddress || "", d: state.doorAddress || "" });
  if (state.blob) p.set("v", state.blob);
  // Credential id + transports are public identifiers (a server would hold them too). They let device B
  // test the by-id modes; the discoverable path never reads them.
  const c = knownCredential();
  if (c) {
    p.set("c", c.credentialId);
    if (c.transports?.length) p.set("t", c.transports.join(","));
  }
  return p;
}
function stepMakeLink() {
  if (!state.accountAddress || !state.doorAddress) return setStatus("s6", "Need the account and door key first (steps 1–3).", "err");
  const p = linkParams();
  const url = `${location.origin}${location.pathname}#${p.toString()}`;
  $("link").value = url;
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  setStatus("s6", "Open this link on your other device (scan the QR, or message it to yourself). Same origin, same passkey → it should reproduce every value.", "ok");
}

function stepStateless() {
  // Judges' "stateless test": wipe everything local, keep only the URL. Nothing but the passkey remains.
  const keepHash = state.expected ? location.hash : `#${linkParams()}`;
  state.accountSession?.end();
  state.doorSession?.end();
  localStorage.clear();
  sessionStorage.clear();
  location.hash = keepHash;
  location.reload();
}

// ---------------------------------------------------------------- report
async function capabilities() {
  const out = { secureContext: isSecureContext, rpId: RP_ID, webauthn: "PublicKeyCredential" in window };
  try { out.platformAuthenticator = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { out.platformAuthenticator = null; }
  try { out.clientCapabilities = PublicKeyCredential.getClientCapabilities ? await PublicKeyCredential.getClientCapabilities() : null; } catch { out.clientCapabilities = null; }
  try { out.conditionalMediation = PublicKeyCredential.isConditionalMediationAvailable ? await PublicKeyCredential.isConditionalMediationAvailable() : null; } catch { out.conditionalMediation = null; }
  return out;
}
let caps = null;
function renderReport() {
  const r = {
    when: new Date().toISOString(),
    ua: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform,
    mode: state.expected ? "device-B (verification)" : "device-A",
    capabilities: caps,
    account: state.accountAddress,
    door: state.doorAddress,
    entry: state.signature,
    credential: {
      known: state.credential?.credentialId || null,
      transports: state.credential?.transports || null,
      fromLink: state.expected?.credential?.credentialId || null,
      mode: currentMode(),
    },
    // What device A put in the link: d= present ⇒ step 3 passed there, v= present ⇒ step 5 encrypt passed there.
    expected: state.expected
      ? { account: state.expected.account, door: state.expected.door || null, blobChars: state.expected.blob?.length || 0, credential: state.expected.credential }
      : null,
    steps: state.results.steps,
    namespaces: state.results.namespaces,
    matches: state.results.matches,
  };
  $("report").value = JSON.stringify(r, null, 2);
  const s = r.steps;
  const cell = (k) => (s[k] ? (s[k].ok ? `✅ ${s[k].ms} ms${s[k].mode ? ` (${s[k].mode})` : ""}` : `❌ ${s[k].cause?.name || s[k].error || ""} @ ${s[k].ms} ms${s[k].mode ? ` (${s[k].mode})` : ""}`) : "·");
  const m = r.matches;
  const match = (k) => (m[k] === undefined ? "·" : m[k] ? "✅" : "❌");
  const probe = Object.keys(r.namespaces.vault).length ? ` · probe: ${probeSummary("vault")}` : "";
  $("row").value = `| <device · browser · passkey provider> | ${cell("create")} | ${cell("signin")} | ${cell("door")} | ${cell("entry")} | ${cell("vaultKey")} / ${cell("encrypt")} / ${cell("decrypt")} | acct ${match("account")} · door ${match("door")} · vault ${match("vault")} | <prompts seen> | <notes>${probe} |`;
}

async function copy(id) {
  try { await navigator.clipboard.writeText($(id).value); } catch { $(id).select(); document.execCommand("copy"); }
}

// ---------------------------------------------------------------- wire up
async function main() {
  $("origin").textContent = `${location.origin} · rpId ${RP_ID} · ${isSecureContext ? "secure context" : "NOT a secure context — WebAuthn will fail"}`;
  $("origin").dataset.kind = isSecureContext ? "ok" : "err";
  caps = await capabilities();
  $("caps").textContent = `platform authenticator ${caps.platformAuthenticator} · PRF capability ${caps.clientCapabilities ? String(caps.clientCapabilities["extension:prf"]) : "unknown (no getClientCapabilities)"} · conditional UI ${caps.conditionalMediation}`;
  if (state.credential) $("known").textContent = `stored credentialId ${short(state.credential.credentialId)} · transports ${JSON.stringify(state.credential.transports ?? null)} (convenience only — the discoverable path ignores it)`;
  if (state.expected) {
    $("mode").hidden = false;
    $("expA").textContent = state.expected.account || "—";
    $("expD").textContent = state.expected.door || "—";
    $("expV").textContent = state.expected.blob ? `${state.expected.blob.length} chars` : "—";
    $("expC").textContent = state.expected.credential ? `${short(state.expected.credential.credentialId)} · transports ${JSON.stringify(state.expected.credential.transports ?? null)}` : "— (old link: sign in first, then the by-id modes use the id it returns)";
    if (state.expected.blob) $("blob").value = state.expected.blob;
  }
  if (state.blob && !$("blob").value) $("blob").value = state.blob;
  document.body.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-act]")?.dataset.act;
    if (!a) return;
    ({
      create: stepCreate,
      signin: () => stepSignIn(false),
      discover: () => stepSignIn(true),
      door: () => stepDoorKey(),
      entry: stepEntry,
      vaultkey: () => stepVaultKey(),
      probe: probeVault,
      encrypt: stepEncrypt,
      decrypt: stepDecrypt,
      link: stepMakeLink,
      stateless: stepStateless,
      copyreport: () => copy("report"),
      copyrow: () => copy("row"),
      copylink: () => copy("link"),
      endsessions: () => { state.accountSession?.end(); state.doorSession?.end(); state.vaultKey = null; setStatus("s7", "Sessions ended: account + door zeroised, vault key dropped. Signing now throws SESSION_ENDED.", "ok"); },
    })[a]?.();
  });
  renderReport();
}
main();
