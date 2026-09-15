import { isIP } from "node:net";

/**
 * Which address a request is rate-limited under.
 *
 * `X-Forwarded-For` is appended to by every proxy on the way in, so its left end is whatever the client
 * chose to send (a spoofer rotates it per request) and only the rightmost entries were written by
 * infrastructure we trust. Reading from the right, internal hops (loopback, private and link-local
 * addresses — the path router in front of the process, a sidecar) are skipped without being configured,
 * then the `trustedHops`-th public entry is the client: 1 behind a single ingress that writes the client's
 * address, 2 when a public-facing CDN or load balancer appends its own address after it. Anything the
 * client controls is ignored entirely: a wrong hop count fails *closed* (everyone shares the proxy's address
 * and its limits) rather than open, because a forged entry can only ever sit to the left of the real one.
 *
 * `trustedHops = 0` means the process is reached directly (no proxy): only the socket address counts and
 * forwarding headers are ignored.
 */
export type ClientIpSource = "socket" | "x-forwarded-for" | "none";

export interface ClientIp {
  /** Key for the limiters: an IPv4 literal, an IPv6 /64 prefix, or `unknown`. */
  key: string;
  /** The address itself, before IPv6 prefixing (for logs and the `/api/ip` echo). */
  address: string | null;
  source: ClientIpSource;
  /** How many `X-Forwarded-For` entries the request carried, whatever their origin. */
  forwardedEntries: number;
}

const UNKNOWN: ClientIp = { key: "unknown", address: null, source: "none", forwardedEntries: 0 };

/** Strips a `[v6]:port` / `v4:port` wrapper and the IPv4-mapped IPv6 prefix; null when not an IP literal. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let text = raw.trim();
  const bracketed = text.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed?.[1]) text = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(text)) text = text.slice(0, text.lastIndexOf(":"));
  const mapped = text.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped?.[1]) text = mapped[1];
  return isIP(text) ? text : null;
}

/** Loopback, private (RFC 1918 / ULA), link-local and unspecified addresses: never a client on the internet. */
export function isInternalIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a = 0, b = 0] = octets;
    return (
      a === 127 ||
      a === 10 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT (RFC 6598)
    );
  }
  if (version === 6) {
    const groups = expandIpv6(address);
    const first = Number.parseInt(groups[0] as string, 16);
    const isZero = groups.slice(0, 7).every((group) => group === "0000");
    if (isZero && (groups[7] === "0001" || groups[7] === "0000")) return true; // ::1, ::
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  }
  return false;
}

/** A single user's IPv6 host rotates inside its /64 (privacy extensions); key the whole prefix. */
export function limiterKey(address: string): string {
  if (isIP(address) !== 6) return address;
  const groups = expandIpv6(address);
  return `${groups.slice(0, 4).join(":")}::/64`;
}

function expandIpv6(address: string): string[] {
  const [head = "", tail = ""] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array.from({ length: Math.max(missing, 0) }, () => "0"), ...right];
  return groups.map((group) => group.toLowerCase().padStart(4, "0"));
}

export function clientIp(
  headers: Headers,
  options: { trustedHops: number; remoteAddress?: string | null },
): ClientIp {
  const forwarded = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  const hops = Math.max(0, Math.floor(options.trustedHops));
  if (hops === 0) {
    const socket = normalizeIp(options.remoteAddress);
    return socket
      ? { key: limiterKey(socket), address: socket, source: "socket", forwardedEntries: forwarded.length }
      : { ...UNKNOWN, forwardedEntries: forwarded.length };
  }
  // From the right: skip internal hops, then count public ones; the hops-th is the client. Running out of
  // entries means the request did not come through the expected proxies — never fall back to the left end,
  // which is client-controlled, and never trust an unparsable entry.
  let remaining = hops;
  for (let index = forwarded.length - 1; index >= 0; index--) {
    const address = normalizeIp(forwarded[index]);
    if (!address) break;
    if (isInternalIp(address)) continue;
    remaining--;
    if (remaining === 0) {
      return {
        key: limiterKey(address),
        address,
        source: "x-forwarded-for",
        forwardedEntries: forwarded.length,
      };
    }
  }
  return { ...UNKNOWN, forwardedEntries: forwarded.length };
}
