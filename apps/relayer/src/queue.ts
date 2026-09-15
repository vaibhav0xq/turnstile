/**
 * One transaction at a time per wallet. Sequential sends are what keep the wallet's nonces in order (viem
 * reads the pending nonce at send time), and the bound is what keeps a burst from piling up behind a slow
 * block: past `max` waiting operations new ones are refused at once, and an operation that has waited
 * longer than `maxWaitMs` for its turn is refused instead of run, because by then the caller's signed
 * request is stale and they have retried anyway. The wait is a real deadline (a timer per waiter), so a
 * running operation that hangs on the RPC cannot hold every waiter hostage — they are refused on time and
 * only the hung slot stays occupied until its own RPC timeout fires.
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
  timer: ReturnType<typeof setTimeout> | undefined;
  start: () => void;
  expire: (waitedMs: number) => void;
};

export interface TransactionQueueOptions {
  /** Operations allowed in the queue at once, the running one included. */
  max: number;
  /** Longest an operation may wait for its turn before it is refused unrun. */
  maxWaitMs: number;
  now?: () => number;
  /** Timer hooks for tests; default to the real ones (unref'd so they never keep the process alive). */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export class TransactionQueue {
  readonly max: number;
  readonly maxWaitMs: number;
  private readonly now: () => number;
  private readonly setTimer: NonNullable<TransactionQueueOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<TransactionQueueOptions["clearTimer"]>;
  private readonly waiting: Task[] = [];
  private running = false;

  constructor(options: TransactionQueueOptions) {
    if (!(options.max >= 1)) throw new Error("queue max must be at least 1");
    this.max = options.max;
    this.maxWaitMs = options.maxWaitMs;
    this.now = options.now ?? Date.now;
    this.setTimer =
      options.setTimer ??
      ((fn, ms) => {
        const timer = setTimeout(fn, ms);
        timer.unref?.();
        return timer;
      });
    this.clearTimer = options.clearTimer ?? clearTimeout;
  }

  /** Operations queued or running right now. */
  get pending(): number {
    return this.waiting.length + (this.running ? 1 : 0);
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= this.max) return Promise.reject(new QueueFullError(this.pending, this.max));
    return new Promise<T>((resolve, reject) => {
      const task: Task = {
        enqueuedAt: this.now(),
        timer: undefined,
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
      };
      // The deadline fires on its own: a waiter is refused after maxWaitMs whether or not the running
      // operation ever comes back.
      task.timer = this.setTimer(() => {
        const index = this.waiting.indexOf(task);
        if (index === -1) return;
        this.waiting.splice(index, 1);
        task.expire(this.now() - task.enqueuedAt);
      }, this.maxWaitMs + 1);
      this.waiting.push(task);
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
    if (task.timer !== undefined) this.clearTimer(task.timer);
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
