/**
 * One transaction at a time per wallet. Sequential sends are what keep the wallet's nonces in order (viem
 * reads the pending nonce at send time), and the bound is what keeps a burst from piling up behind a slow
 * block: past `max` waiting operations new ones are refused at once, and an operation that has waited
 * longer than `maxWaitMs` for its turn is refused instead of run, because by then the caller's signed
 * request is stale and they have retried anyway.
 *
 * This is a per-process guard. Two relayer processes sharing one key would still race each other's nonces —
 * the deployment must run a single instance (see docs/deploy-monad-testnet.md); `/api/health` reports an
 * `instance` id so the sweep can tell.
 */
export class QueueFullError extends Error {
  readonly pending: number;
  readonly max: number;
  constructor(pending: number, max: number) {
    super(`transaction queue full (${pending}/${max})`);
    this.name = "QueueFullError";
    this.pending = pending;
    this.max = max;
  }
}

export class QueueTimeoutError extends Error {
  readonly waitedMs: number;
  constructor(waitedMs: number) {
    super(`transaction waited ${waitedMs} ms for the queue`);
    this.name = "QueueTimeoutError";
    this.waitedMs = waitedMs;
  }
}

type Task = {
  enqueuedAt: number;
  start: () => void;
  expire: (waitedMs: number) => void;
};

export interface TransactionQueueOptions {
  /** Operations allowed in the queue at once, the running one included. */
  max: number;
  /** Longest an operation may wait for its turn before it is refused unrun. */
  maxWaitMs: number;
  now?: () => number;
}

export class TransactionQueue {
  readonly max: number;
  readonly maxWaitMs: number;
  private readonly now: () => number;
  private readonly waiting: Task[] = [];
  private running = false;

  constructor(options: TransactionQueueOptions) {
    if (!(options.max >= 1)) throw new Error("queue max must be at least 1");
    this.max = options.max;
    this.maxWaitMs = options.maxWaitMs;
    this.now = options.now ?? Date.now;
  }

  /** Operations queued or running right now. */
  get pending(): number {
    return this.waiting.length + (this.running ? 1 : 0);
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= this.max) return Promise.reject(new QueueFullError(this.pending, this.max));
    return new Promise<T>((resolve, reject) => {
      this.waiting.push({
        enqueuedAt: this.now(),
        start: () => {
          // The slot is released before the caller hears back, so `pending` is exact by the time it does.
          Promise.resolve()
            .then(operation)
            .then(
              (value) => {
                this.finish();
                resolve(value);
              },
              (error: unknown) => {
                this.finish();
                reject(error);
              },
            );
        },
        expire: (waitedMs) => reject(new QueueTimeoutError(waitedMs)),
      });
      this.pump();
    });
  }

  private finish(): void {
    this.running = false;
    this.pump();
  }

  private pump(): void {
    if (this.running) return;
    const task = this.waiting.shift();
    if (!task) return;
    const waited = this.now() - task.enqueuedAt;
    if (waited > this.maxWaitMs) {
      task.expire(waited);
      this.pump();
      return;
    }
    this.running = true;
    task.start();
  }
}
