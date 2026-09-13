import assert from "node:assert/strict";
import test from "node:test";
import { turnstileEventAbi } from "@turnstile/contracts/abi";
import { type Abi, encodeErrorResult } from "viem";
import { decodeContractError } from "../src/errors.ts";

const eventAbi: Abi = turnstileEventAbi;

test("decodes raw custom error data through a cause chain", () => {
  const data = encodeErrorResult({ abi: eventAbi, errorName: "SeatTaken", args: [42n] });
  const decoded = decodeContractError({ cause: { data } });
  assert.equal(decoded.code, "SeatTaken");
  assert.deepEqual(decoded.args, [42n]);
});

test("returns a stable generic error", () => {
  assert.equal(decodeContractError(new Error("boom")).code, "CONTRACT_REVERTED");
});
