// Same-origin `/api` in dev (Vite proxies to the relayer) and in the default production layout;
// VITE_API_URL points at a separately hosted relayer.
export const API_URL: string =
  (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; args?: unknown };
  code?: string;
  message?: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const e = (body ?? {}) as ErrorBody;
    const code = e.error?.code ?? e.code ?? `HTTP_${res.status}`;
    const message = e.error?.message ?? e.message ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, code, message, body);
  }
  return body as T;
}
