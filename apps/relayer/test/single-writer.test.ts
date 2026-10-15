// The advisory-lock handoff: one writer, and one standby that takes over on release. Runs against
// TEST_DATABASE_URL, else DATABASE_URL, and is skipped without either (CI has none). Uses a random
// throwaway lock id per run, so a crashed earlier run holding a pooler-side lock can never fail this
// one, and every lock taken here is released.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acquireSingleWriterWhenFree } from "../src/single-writer.ts";

const url = process.env["TEST_DATABASE_URL"] || process.env["DATABASE_URL"];
const RETRY_MS = 1_000;
const TIMEOUT_MS = 60_000;

function freshChain() {
  return 800_000_000 + Math.floor(Math.random() * 199_999_999);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, what: string) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

describe("single-writer handoff", { skip: url ? false : "DATABASE_URL not set" }, () => {
  it("keeps the standby out of the lock, then hands over on release", async () => {
    // The writer must hold the lock before the standby starts, or the two loops race for it.
    const chain = freshChain();
    const writer = acquireSingleWriterWhenFree(url as string, chain, RETRY_MS);
    let standby: ReturnType<typeof acquireSingleWriterWhenFree> | null = null;
    try {
      await waitFor(writer.isWriter, "the writer to take the lock");
      standby = acquireSingleWriterWhenFree(url as string, chain, RETRY_MS);
      await sleep(RETRY_MS * 5);
      assert.equal(standby.isWriter(), false, "the standby must not take the lock while held");
      await writer.release();
      await waitFor(standby.isWriter, "the standby to take over after release");
    } finally {
      await writer.release();
      await standby?.release();
    }
    assert.equal(writer.isWriter(), false);
    assert.equal(standby?.isWriter(), false);
  });

  it("stops retrying when released while still on standby", async () => {
    const chain = freshChain();
    const holder = acquireSingleWriterWhenFree(url as string, chain, RETRY_MS);
    await waitFor(holder.isWriter, "the holder to take the lock");
    const standby = acquireSingleWriterWhenFree(url as string, chain, RETRY_MS);
    try {
      await sleep(RETRY_MS * 5);
      assert.equal(standby.isWriter(), false, "the standby must not take the lock while held");
      await standby.release();
      await holder.release();
      await sleep(RETRY_MS * 3);
      assert.equal(standby.isWriter(), false, "a released standby must never become writer");
    } finally {
      await holder.release();
      await standby.release();
    }
  });
});
