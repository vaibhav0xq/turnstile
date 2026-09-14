import assert from "node:assert/strict";
import { test } from "node:test";
import { environmentLabel } from "../src/lib/environment.ts";

test("the relayer's label wins, trimmed and bounded", () => {
  assert.equal(environmentLabel(" staging ", "tickets.example"), "staging");
  assert.equal(environmentLabel("x".repeat(40), "tickets.example")?.length, 24);
});

test("a *.replit.app host is flagged as staging even without a label", () => {
  assert.equal(environmentLabel(null, "turnstile-someone.replit.app"), "staging");
  assert.equal(environmentLabel("", "Turnstile.REPLIT.APP"), "staging");
});

test("the real host and local development stay unlabelled", () => {
  assert.equal(environmentLabel(null, "tickets.example"), null);
  assert.equal(environmentLabel(undefined, "localhost"), null);
  assert.equal(environmentLabel(null, "abc.replit.dev"), null);
  assert.equal(environmentLabel(null, "replit.app.example"), null);
});
