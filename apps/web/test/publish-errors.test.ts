import assert from "node:assert/strict";
import { test } from "node:test";
import { BaseError } from "viem";
import { isBalanceLag } from "../src/app/publish-errors.ts";

test("isBalanceLag recognises the node refusing a send for a balance it has not seen", () => {
  assert.equal(
    isBalanceLag(
      new BaseError("Missing or invalid parameters.", { details: "Signer had insufficient balance" }),
    ),
    true,
  );
  assert.equal(
    isBalanceLag(new BaseError("Missing or invalid parameters.", { details: "invalid argument 0" })),
    false,
  );
  assert.equal(isBalanceLag(new Error("Signer had insufficient balance")), false);
});
