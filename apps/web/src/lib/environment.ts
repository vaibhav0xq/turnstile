/**
 * Label for origins that are not the product's home: the relayer's `ENVIRONMENT_LABEL` (e.g. `staging`),
 * or `staging` for a `*.replit.app` rehearsal host that forgot to set it. Null means nothing to flag.
 */
export function environmentLabel(configured: string | null | undefined, hostname: string): string | null {
  const label = configured?.trim();
  if (label) return label.slice(0, 24);
  if (/\.replit\.app$/i.test(hostname)) return "staging";
  return null;
}
