import assert from "node:assert/strict";
import test from "node:test";
import { turnstileEventAbi } from "@turnstile/contracts/abi";
import { type Abi, encodeFunctionData } from "viem";
import { relayGas, validateRelayBody } from "../src/forward-request.ts";

const eventAbi: Abi = turnstileEventAbi;

const base = {
  from: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  to: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  value: "0",
  gas: String(relayGas.buy),
  deadline: String(Math.floor(Date.now() / 1000) + 300),
  data: encodeFunctionData({ abi: eventAbi, functionName: "buy", args: [42n] }),
  signature: `0x${"11".repeat(65)}`,
};

test("accepts an allowed selector at its gas cap", () => {
  const result = validateRelayBody({ request: base });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.action, "buy");
});

test("rejects disallowed selectors", () => {
  const result = validateRelayBody({ request: { ...base, data: "0x12345678" } });
  assert.deepEqual(result.ok ? "" : result.code, "SELECTOR_NOT_ALLOWED");
});

test("rejects gas over action cap", () => {
  const result = validateRelayBody({ request: { ...base, gas: String(relayGas.buy + 1) } });
  assert.deepEqual(result.ok ? "" : result.code, "GAS_TOO_HIGH");
});

test("rejects value and invalid deadlines", () => {
  assert.equal(validateRelayBody({ request: { ...base, value: "1" } }).ok, false);
  const result = validateRelayBody({ request: { ...base, deadline: "1" } });
  assert.deepEqual(result.ok ? "" : result.code, "BAD_DEADLINE");
});
