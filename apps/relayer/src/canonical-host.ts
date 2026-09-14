// One canonical host. Passkeys are scoped to the RP ID (the page's registrable domain by default), so an
// app reachable as both `turnstile.show` and `www.turnstile.show` would grow two passkey populations.
// The relayer answers alias hosts with a redirect before any page — and therefore any credential — is created.
// Aliases are `www.<canonical>` plus whatever REDIRECT_HOSTS lists (a backup domain pointed at the same
// deployment, say). Health checks and the deployment's own hostname never match, so they are untouched.

export type CanonicalHostPolicy = {
  /** Canonical origin, no trailing slash (`https://turnstile.show`). */
  origin: string;
  /** Lower-case hostnames (no port) that redirect to the canonical origin. */
  aliases: ReadonlySet<string>;
};

/** Builds the policy from `PUBLIC_ORIGIN` and `REDIRECT_HOSTS`; null when there is no public origin to redirect to. */
export function canonicalHostPolicy(
  publicOrigin: string | null,
  redirectHosts: string | undefined,
): CanonicalHostPolicy | null {
  if (!publicOrigin) return null;
  let canonical: URL;
  try {
    canonical = new URL(publicOrigin);
  } catch {
    return null;
  }
  const host = canonical.hostname.toLowerCase();
  const aliases = new Set<string>([`www.${host}`]);
  for (const raw of (redirectHosts ?? "").split(",")) {
    const alias = raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[/:].*$/, "");
    if (alias && alias !== host) aliases.add(alias);
  }
  return { origin: `${canonical.protocol}//${canonical.host}`, aliases };
}

/** Hostname (no port, lower-case) from a `Host` header, or null when it is missing or malformed. */
export function hostnameOf(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;
  const value = hostHeader.trim().toLowerCase();
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:[0-9]{1,5})?$/.exec(value);
  return match?.[1] ?? null;
}

/**
 * Where a request must be redirected under the policy, or null when it is already on the canonical host
 * (or on any host that is not a declared alias). `pathAndQuery` is the request path with its query string.
 */
export function redirectTarget(
  policy: CanonicalHostPolicy | null,
  hostHeader: string | null | undefined,
  pathAndQuery: string,
): string | null {
  if (!policy) return null;
  const host = hostnameOf(hostHeader);
  if (!host || !policy.aliases.has(host)) return null;
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return `${policy.origin}${path}`;
}

/** 301 for GET/HEAD (cacheable), 308 otherwise so a method and body survive the hop. */
export function redirectStatus(method: string): 301 | 308 {
  return method === "GET" || method === "HEAD" ? 301 : 308;
}
