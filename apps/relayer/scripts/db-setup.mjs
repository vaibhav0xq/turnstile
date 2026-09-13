#!/usr/bin/env node
// Applies db/schema.sql to DATABASE_URL. Idempotent; this is the only place the relayer touches a schema.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
try {
  await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  const [row] = await sql`select count(*)::int as n from passports`;
  console.log(`passports table ready (${row.n} record${row.n === 1 ? "" : "s"})`);
} finally {
  await sql.end();
}
