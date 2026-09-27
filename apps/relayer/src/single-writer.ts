import postgres from "postgres";

// Dedicated session: a transaction-scoped lock or a pooled query would release ownership too early.
// This is per database AND chain, so staging must have a separate Postgres instance and wallet keys.
const lockNamespace = 0x5455524e00000000n;
let liveLeaseCheck: (() => Promise<void>) | null = null;

/** Check the reserved database session immediately before each hosted wallet send. */
export async function assertWriterLease() {
  if (!process.env["HOSTING_MODE"]) return;
  if (!liveLeaseCheck) throw new Error("Single-writer lease is not active");
  await liveLeaseCheck();
}

export async function acquireSingleWriter(databaseUrl: string, chainId: number) {
  const sql = postgres(databaseUrl, { max: 1 });
  const lockId = lockNamespace + BigInt(chainId);
  let reserved: Awaited<ReturnType<typeof sql.reserve>> | undefined;
  try {
    reserved = await sql.reserve();
    const session = reserved;
    const [row] = await session.unsafe(
      "select pg_try_advisory_lock($1::bigint) as acquired, pg_backend_pid() as pid",
      [lockId.toString()],
    );
    if (!row?.["acquired"]) throw new Error("Another relayer owns the single-writer lock");
    const pid = Number(row["pid"]);
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
