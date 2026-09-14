// The Live layer talks to the Envio indexer's GraphQL endpoint (Hasura). It is off unless the deployment
// sets VITE_ENVIO_GRAPHQL_URL; nothing here ever fabricates rows when the indexer is missing or behind.

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
const raw = env["VITE_ENVIO_GRAPHQL_URL"]?.trim();

/** The indexer endpoint, or null when this deployment has none configured. */
export const LIVE_URL: string | null = raw ? raw : null;
export const liveEnabled = LIVE_URL !== null;

export class LiveError extends Error {
  readonly kind: "network" | "http" | "graphql";
  readonly status: number | undefined;

  constructor(kind: "network" | "http" | "graphql", message: string, status?: number) {
    super(message);
    this.name = "LiveError";
    this.kind = kind;
    this.status = status;
  }
}

interface GraphQLBody<T> {
  data?: T | null;
  errors?: Array<{ message?: string }>;
}

export async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
  url: string | null = LIVE_URL,
): Promise<T> {
  if (!url) throw new LiveError("network", "No indexer configured (VITE_ENVIO_GRAPHQL_URL is unset)");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new LiveError(
      "network",
      `Indexer unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!res.ok) throw new LiveError("http", `Indexer answered ${res.status}`, res.status);
  const body = (await res.json()) as GraphQLBody<T>;
  if (body.errors?.length) {
    throw new LiveError("graphql", body.errors.map((e) => e.message ?? "unknown error").join("; "));
  }
  if (!body.data) throw new LiveError("graphql", "Indexer returned no data");
  return body.data;
}
