// Headless verification of the spike with Chromium's virtual authenticator (CTAP2.1, resident key,
// user verification, PRF/hmac-secret). This proves the code path — it does NOT replace real devices
// (real passkey providers, prompt counts, sync/hybrid behaviour are exactly what docs/device-matrix.md is for).
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = 4173;
const html = readFileSync(new URL("./dist/index.html", import.meta.url));
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(PORT);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM || "/repl/tools/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });

const cdp = await page.createCDPSession();
await cdp.send("WebAuthn.enable", { enableUI: false });
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    ctap2Version: "ctap2_1",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    hasPrf: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
console.log("virtual authenticator", authenticatorId);

const text = (sel) => page.$eval(sel, (el) => el.textContent.trim());
const value = (sel) => page.$eval(sel, (el) => el.value);
const click = (act) => page.click(`[data-act="${act}"]`);
const waitStatus = (id, re, ms = 20000) => page.waitForFunction((id, src) => new RegExp(src).test(document.getElementById(id).textContent), { timeout: ms }, id, re.source);
const steps = [];
const ok = (name, cond, detail = "") => { steps.push({ name, ok: !!cond, detail }); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
ok("secure context + capabilities", /secure context/.test(await text("#origin")), await text("#caps"));

// 1 create → account
await click("create"); await waitStatus("s1", /Passkey created|Error|[A-Z_]+:/);
const s1 = await text("#s1"); const account = await text("#account");
ok("1 create passkey (PRF at create time)", /^0x[0-9a-fA-F]{40}$/.test(account), `${s1} · ${account}`);

// 2 sign in with stored id → same account
await click("signin"); await waitStatus("s2", /Signed in|[A-Z_]+:/);
ok("2 sign in (stored credential id) → same account", (await text("#account")) === account, await text("#s2"));

// 3 door key
await click("door"); await waitStatus("s3", /Door key derived|[A-Z_]+:/);
const door = await text("#door");
ok("3 presence namespace → door key", /^0x[0-9a-fA-F]{40}$/.test(door) && door !== account, `${await text("#s3")} · ${door}`);

// 4 entry sign/verify
await click("entry"); await waitStatus("s4", /✅|❌|[A-Z_]+:/);
ok("4 Entry typed data sign + verify (ecrecover == door key)", /✅/.test(await text("#s4")), await text("#entry"));

// 5 vault
await click("vaultkey"); await waitStatus("s5", /Vault key ready|[A-Z_]+:/);
await click("encrypt"); await waitStatus("s5b", /Encrypted|[A-Z_]+:/);
const blob = await value("#blob");
await click("decrypt"); await waitStatus("s5c", /✅|DECRYPT|[A-Z_]+:/);
ok("5 vault namespace encrypt → decrypt", /✅/.test(await text("#s5c")) && blob.startsWith("v1."), `${blob.length} chars`);

// 6 link + stateless test (wipe storage, reload with expected values, fresh-device path)
await click("link"); await waitStatus("s6", /Open this link/);
const link = await value("#link");
ok("6 verification link + QR", link.includes(`#a=${account}`) && (await page.$("#qr svg")) !== null, link.slice(0, 80) + "…");
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), click("stateless")]);
const wiped = await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0);
const modeShown = await page.$eval("#mode", (el) => !el.hidden);
ok("6 storage wiped, verification mode from URL", wiped && modeShown);
ok("6 link carries credential id + transports for device B", link.includes("&c=") && link.includes("&t="), link.match(/&c=[^&]+&t=[^&]+/)?.[0]);
await click("discover"); await waitStatus("s2", /Signed in|[A-Z_]+:/);
ok("6 fresh-device sign-in (discoverable, nothing stored) → same account", /✅ same account/.test(await text("#s2")) && /same credential id as device A/.test(await text("#s2")), await text("#s2"));
// Default ceremony mode is discoverable: the door step must confirm the SAME passkey answered (by credential id).
await click("door"); await waitStatus("s3", /Door key derived|[A-Z_]+:/);
ok("6 same door key from the passkey alone (discoverable + same-credential check)", /✅ same door key/.test(await text("#s3")) && /same passkey as sign-in/.test(await text("#s3")), await text("#s3"));
await click("vaultkey"); await waitStatus("s5", /Vault key ready|[A-Z_]+:/);
await click("decrypt"); await waitStatus("s5c", /✅|DECRYPT|[A-Z_]+:/);
ok("6 device A's blob decrypts after wipe", /device A/.test(await text("#s5c")), await text("#s5c"));
await click("entry"); await waitStatus("s4", /✅|❌|[A-Z_]+:/);
ok("6 Entry still verifies with the re-derived door key", /✅/.test(await text("#s4")));

// 6b probe: vault namespace in all three ceremony modes (discoverable / allowCredentials id / id+transports)
await click("probe"); await waitStatus("s5p", /Probe done/, 60000);
const ns = JSON.parse(await value("#report")).namespaces.vault;
ok("6 probe: all three ceremony modes pass on the virtual authenticator", ["discoverable", "id", "id+transports"].every((m) => ns[m]?.ok && ns[m].sameCredential === true), await text("#s5p"));

// 7 sessions end → SESSION_ENDED
await click("endsessions"); await waitStatus("s7", /Sessions ended/);
await click("entry"); await waitStatus("s4", /SESSION_ENDED|✅|❌/);
ok("7 signing after end() throws SESSION_ENDED", /SESSION_ENDED/.test(await text("#s4")), await text("#s4"));

// Negative control: a different passkey must give a different account and must NOT open the blob.
// Pin the ceremony to allowCredentials by id so the virtual authenticator (now holding two resident passkeys)
// deterministically answers with the NEW one.
await click("create"); await waitStatus("s1", /Passkey created|[A-Z_]+:/);
const account2 = await text("#account");
await page.select("#prfmode", "id");
await click("vaultkey"); await waitStatus("s5", /Vault key ready|[A-Z_]+:/);
await page.$eval("#blob", (el, b) => { el.value = b; }, blob);
await click("decrypt"); await waitStatus("s5c", /✅|DECRYPT|[A-Z_]+:/);
ok("N different passkey → different account, blob does not decrypt", account2 !== account && /DECRYPT_FAILED/.test(await text("#s5c")), `${account2} · ${await text("#s5c")}`);

// Failure instrumentation: a by-id ceremony naming a credential that does not exist must report elapsed ms
// and the underlying WebAuthn DOMException name — the two facts a real-device failure row needs.
await page.evaluate(() => localStorage.setItem("turnstile.spike.credential", JSON.stringify({ credentialId: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8" })));
await page.reload({ waitUntil: "networkidle0" });
await page.select("#prfmode", "id");
await click("vaultkey"); await waitStatus("s5", /Vault key ready|failed after/);
const failedStep = JSON.parse(await value("#report")).steps.vaultKey;
ok("N unknown credential id → failure carries cause.name + elapsed ms", failedStep.ok === false && typeof failedStep.cause?.name === "string" && failedStep.ms >= 0, `${failedStep.cause?.name}: ${failedStep.cause?.message} @ ${failedStep.ms} ms`);

const report = JSON.parse(await value("#report"));
const failed = steps.filter((s) => !s.ok);
console.log(`\n${steps.length - failed.length}/${steps.length} checks passed`);
console.log("timings (ms):", Object.fromEntries(Object.entries(report.steps).map(([k, v]) => [k, v.ms])));
console.log("vault namespace by mode:", report.namespaces.vault);
await browser.close();
server.close();
process.exit(failed.length ? 1 : 0);
