// A write that arrives while the instance is standby (it has not acquired the lease) must be
// refused by assertWriterLease with the recognizable WriterLeaseError, which the HTTP layer maps
// to a retryable 503. Standby is exactly the state where this process holds no lease, so this
// needs no database; node runs each test file in its own process, keeping the module state clean.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { assertWriterLease, WriterLeaseError } from "../src/single-writer.ts";

describe("writes during standby", () => {
  after(() => {
    delete process.env["HOSTING_MODE"];
  });

  it("refuses a hosted write with WriterLeaseError while no lease is held", async () => {
    process.env["HOSTING_MODE"] = "1";
    await assert.rejects(assertWriterLease(), WriterLeaseError);
  });

  it("lets non-hosted writes through without a lease", async () => {
    delete process.env["HOSTING_MODE"];
    await assertWriterLease();
  });
});
