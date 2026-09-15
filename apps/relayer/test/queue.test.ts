import assert from "node:assert/strict";
import test from "node:test";
import { QueueFullError, QueueTimeoutError, TransactionQueue } from "../src/queue.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("runs one operation at a time, in order", async () => {
  const queue = new TransactionQueue({ max: 10, maxWaitMs: 60_000 });
  const order: string[] = [];
  const first = deferred<void>();
  const a = queue.run(async () => {
    order.push("a:start");
    await first.promise;
    order.push("a:end");
    return "a";
  });
  const b = queue.run(async () => {
    order.push("b:start");
    return "b";
  });
  await tick();
  assert.deepEqual(order, ["a:start"]);
  assert.equal(queue.pending, 2);
  first.resolve();
  assert.equal(await a, "a");
  assert.equal(await b, "b");
  assert.deepEqual(order, ["a:start", "a:end", "b:start"]);
  assert.equal(queue.pending, 0);
});

test("refuses new work at the bound, counting the running operation", async () => {
  const queue = new TransactionQueue({ max: 2, maxWaitMs: 60_000 });
  const gate = deferred<void>();
  const running = queue.run(() => gate.promise);
  const waiting = queue.run(async () => "second");
  await assert.rejects(
    queue.run(async () => "third"),
    (error: unknown) => {
      assert.ok(error instanceof QueueFullError);
      assert.equal(error.pending, 2);
      assert.equal(error.max, 2);
      return true;
    },
  );
  gate.resolve();
  await running;
  assert.equal(await waiting, "second");
  // Space frees up as work drains.
  assert.equal(await queue.run(async () => "fourth"), "fourth");
});

test("a failing operation releases its slot", async () => {
  const queue = new TransactionQueue({ max: 1, maxWaitMs: 60_000 });
  await assert.rejects(
    queue.run(async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(queue.pending, 0);
  assert.equal(await queue.run(async () => "ok"), "ok");
});

test("work that waited past maxWaitMs is refused unrun", async () => {
  let now = 0;
  const queue = new TransactionQueue({ max: 5, maxWaitMs: 1_000, now: () => now });
  const gate = deferred<void>();
  const running = queue.run(() => gate.promise);
  let ran = false;
  const stale = queue.run(async () => {
    ran = true;
  });
  const fresh = deferred<void>();
  now = 5_000;
  const later = queue.run(async () => "later");
  gate.resolve();
  await running;
  await assert.rejects(stale, (error: unknown) => {
    assert.ok(error instanceof QueueTimeoutError);
    assert.equal(error.waitedMs, 5_000);
    return true;
  });
  assert.equal(ran, false);
  fresh.resolve();
  assert.equal(await later, "later");
});

test("rejects a bound below one", () => {
  assert.throws(() => new TransactionQueue({ max: 0, maxWaitMs: 1 }));
});
