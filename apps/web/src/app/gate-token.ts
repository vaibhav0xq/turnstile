// Operator token for a protected door (relayer `GATE_TOKEN`). Handed over once in the URL fragment
// (`/gate/<event>#token=…`, stripped on arrival like `#code=`) or typed at the door, then kept for the
// session only — a shared gate tablet should forget it when the tab closes.

const KEY = "turnstile.gateToken";

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storeGateToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    // private mode: the token lives in memory for this page only
  }
}

/** Fragment params (`code`, `token`) are read once and dropped from the URL so a share or refresh never carries them. */
export function consumeGateFragment(): { code: string | undefined; token: string | null } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get("code") ?? undefined;
  const token = params.get("token");
  if (code !== undefined || token !== null) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  if (token) storeGateToken(token);
  return { code, token: token ?? read() };
}
