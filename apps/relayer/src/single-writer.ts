import postgres from "postgres";

// Dedicated session: a transaction-scoped lock or a pooled query would release ownership too early.
// This is per database AND chain, so staging must have a separate Postgres instance and wallet keys.
const lockNamespace = 0x5455524e00000000n;
let liveLeaseCheck: (() => Promise<void>) | null = null;

/** A hosted write reached an instance that does not hold the writer lease (standby or draining). */
export class WriterLeaseError extends Error {
  constructor() {
    super("Single-writer lease is not active");
    this.name = "WriterLeaseError";
  }
}

/** Check the reserved database session immediately before each hosted wallet send. */
export async function assertWriterLease() {
  if (!process.env["HOSTING_MODE"]) return;
  if (!liveLeaseCheck) throw new WriterLeaseError();
  await liveLeaseCheck();
}

export interface WriterLease {
  /** True only while this instance holds the advisory lock. */
  isWriter(): boolean;
  /** Stop retrying, and release the lock if held. */
  release(): Promise<void>;
}

/** One reserved session, polling the lock on it until it is free or the caller stops waiting. */
async function tryAcquire(
  databaseUrl: string,
  chainId: number,
  retryMs: number,
  isStopped: () => boolean,
): Promise<(() => Promise<void>) | null> {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  const lockId = lockNamespace + BigInt(chainId);
  let reserved: Awaited<ReturnType<typeof sql.reserve>> | undefined;
  try {
    reserved = await sql.reserve();
    const session = reserved;
    let pid = NaN;
    for (;;) {
      const [row] = await session.unsafe(
        "select pg_try_advisory_lock($1::bigint) as acquired, pg_backend_pid() as pid",
        [lockId.toString()],
      );
      if (row?.["acquired"]) {
        pid = Number(row["pid"]);
        break;
      }
      if (isStopped()) {
        reserved.release();
        await sql.end();
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
    const check = async () => {
      const [current] = await session.unsafe("select pg_backend_pid() as pid");
      if (Number(current?.["pid"]) !== pid) throw new Error("Single-writer database session changed");
    };
    liveLeaseCheck = check;
    let checking = false;
    const heartbeat = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        await check();
      } catch {
        // A lost lease must never leave a wallet writer running.
        liveLeaseCheck = null;
        process.stderr.write("Single-writer lease lost; stopping relayer\n");
        process.exit(1);
      } finally {
        checking = false;
      }
    }, 5_000);
    heartbeat.unref();
    return async () => {
      clearInterval(heartbeat);
      liveLeaseCheck = null;
      try {
        await session.unsafe("select pg_advisory_unlock($1::bigint)", [lockId.toString()]);
      } finally {
        session.release();
        await sql.end();
      }
    };
  } catch (error) {
    reserved?.release();
    await sql.end();
    throw error;
  }
}

/**
 * Retry the lock in the background until it is free. The instance serves health checks as standby
 * while the current writer drains, then takes over without a deploy-window conflict. Every hosted
 * wallet send still goes through assertWriterLease(), so a standby never writes.
 */
export function acquireSingleWriterWhenFree(
  databaseUrl: string,
  chainId: number,
  retryMs = 5_000,
): WriterLease {
  let writer = false;
  let stopped = false;
  let release: (() => Promise<void>) | null = null;
  const loop = (async () => {
    while (!stopped) {
      try {
        // Polls on one reserved session until the lock is free; null means we were stopped waiting.
        const acquired = await tryAcquire(databaseUrl, chainId, retryMs, () => stopped);
        if (!acquired) return;
        if (stopped) {
          await acquired();
          return;
        }
        release = acquired;
        writer = true;
        console.log("single-writer lock acquired; this instance is the writer");
        return;
      } catch (error) {
        process.stderr.write(
          `single-writer lock attempt failed (${error instanceof Error ? error.message : String(error)}); retrying\n`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryMs));
      }
    }
  })();
  void loop.catch(() => {});
  return {
    isWriter: () => writer,
    release: async () => {
      stopped = true;
      writer = false;
      const held = release;
      release = null;
      await held?.();
    },
  };
}
