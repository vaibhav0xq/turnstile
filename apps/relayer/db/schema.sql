-- Turnstile relayer schema: the private passport store (identity SPEC §4.6). Apply once per database with
-- `pnpm --filter @turnstile/relayer db:setup` (reads DATABASE_URL); the relayer refuses to start against a
-- database that lacks it and never alters a schema itself.
create table if not exists passports (
  address    text   primary key, -- EIP-55 checksummed account
  blob       text   not null,    -- v1 passport blob; '' is a tombstone (cleared, watermark kept)
  issued_at  bigint not null,    -- the account's watermark, ms since epoch
  updated_at bigint not null     -- the store's clock at the write, ms since epoch
);
