#!/usr/bin/env node
// Read-only schema check. Never print a connection string or passport record.
import postgres from "postgres";

const url = process.env["DATABASE_URL"];
if (!url) {
  process.stderr.write("DATABASE_URL is required\n");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const rows = await sql`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = current_schema() and table_name = 'passports'
  `;
  const columns = new Map(rows.map((row) => [row.column_name, row]));
  const expected = {
    address: "text",
    blob: "text",
    issued_at: "bigint",
    updated_at: "bigint",
  };
  for (const [name, type] of Object.entries(expected)) {
    const column = columns.get(name);
    if (column?.data_type !== type || column.is_nullable !== "NO") {
      throw new Error(`passports schema missing or incompatible column ${name}`);
    }
  }
  process.stdout.write("Passport schema ready\n");
} catch {
  process.stderr.write("Passport schema unavailable or incompatible; no data was changed\n");
  process.exitCode = 1;
} finally {
  await sql.end();
}
