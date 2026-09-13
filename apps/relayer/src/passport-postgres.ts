// Passport storage in Postgres for hosts whose disk does not survive a deploy or that run more than one
// relayer process. The watermark comparison happens inside the upsert, so two processes racing on the
// same account cannot roll it back. Schema: db/schema.sql, applied once with `pnpm db:setup`.
import postgres, { type Sql } from "postgres";
import type { Address } from "viem";
import type { PassportBackend, PassportRecord } from "./passport.ts";

type Row = { blob: string; issued_at: string; updated_at: string };

export class PostgresPassportBackend implements PassportBackend {
  private readonly sql: Sql;

  private constructor(sql: Sql) {
    this.sql = sql;
  }

  /** Connects and refuses to start against a database that has not had the schema applied. */
  static async open(url: string): Promise<PostgresPassportBackend> {
    const sql = postgres(url, { max: 4, idle_timeout: 30, connect_timeout: 10 });
    try {
      const [row] = await sql<{ name: string | null }[]>`select to_regclass('public.passports') as name`;
      if (!row?.name) {
        throw new Error(
          "DATABASE_URL points at a database without the passports table: run `pnpm --filter @turnstile/relayer db:setup`",
        );
      }
    } catch (error) {
      await sql.end();
      throw error;
    }
    return new PostgresPassportBackend(sql);
  }

  async get(address: Address): Promise<PassportRecord | undefined> {
    const [row] = await this.sql<Row[]>`
      select blob, issued_at, updated_at from passports where address = ${address}`;
    return row
      ? { blob: row.blob, issuedAt: Number(row.issued_at), updatedAt: Number(row.updated_at) }
      : undefined;
  }

  async putIfNewer(address: Address, record: PassportRecord): Promise<boolean> {
    const rows = await this.sql`
      insert into passports (address, blob, issued_at, updated_at)
      values (${address}, ${record.blob}, ${record.issuedAt}, ${record.updatedAt})
      on conflict (address) do update
        set blob = excluded.blob, issued_at = excluded.issued_at, updated_at = excluded.updated_at
        where passports.issued_at < excluded.issued_at
      returning address`;
    return rows.length === 1;
  }

  async count(): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`select count(*)::int as n from passports`;
    return row?.n ?? 0;
  }

  close(): Promise<void> {
    return this.sql.end();
  }
}
