import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { type AppConfig, chainName } from "../chain/config";
import { useIdentity } from "../identity/store";
import { environmentLabel } from "../lib/environment";
import { formatMs, shortAddress } from "../lib/format";
import { useTelemetry } from "../lib/telemetry";
import { useDirector } from "../scene/director";
import { Dot, Kicker } from "./primitives";

export function Curtain() {
  const curtain = useDirector((s) => s.curtain);
  return <div className="curtain" style={{ opacity: curtain ? 1 : 0 }} aria-hidden />;
}

export function TopBar({ config, onSignIn }: { config: AppConfig | undefined; onSignIn: () => void }) {
  const fan = useIdentity((s) => s.fan);
  const knownAddress = useIdentity((s) => s.knownAddress);
  const busy = useIdentity((s) => s.busy);
  const devSeed = useIdentity((s) => s.devSeed);
  const live = fan && fan.expiresAt > Date.now();
  const location = useLocation();
  const home = location.pathname === "/";
  const envLabel = environmentLabel(config?.environmentLabel, window.location.hostname);
  // A rehearsal origin says so in the tab as well as the header — the staging URL is not the product's home.
  useEffect(() => {
    const base = "Turnstile — access that follows you";
    document.title = envLabel ? `[${envLabel}] ${base}` : base;
  }, [envLabel]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between p-4 sm:p-6">
      <Link to="/" className="pointer-events-auto flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-ink-2/70">
          <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="17" fill="none" stroke="#ffb457" strokeWidth="4" />
            <path d="M32 15v34M15 32h34" stroke="#ffb457" strokeWidth="4" strokeLinecap="round" />
            <circle cx="32" cy="32" r="5" fill="#7ee7ff" />
          </svg>
        </span>
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="display text-xl">Turnstile</span>
          <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted">
            {config ? chainName(config.chainId) : "connecting"}
          </span>
        </span>
        {envLabel ? (
          <span
            className="chip mono border-amber/60 bg-amber/10 text-[10px] uppercase tracking-[0.2em] text-amber"
            title="Internal rehearsal origin — not the final host. Passkeys made here stay here."
            data-testid="environment-label"
          >
            {envLabel}
          </span>
        ) : null}
      </Link>

      <div className="pointer-events-auto flex items-center gap-2">
        {!home ? (
          <Link to="/" className="chip mono hover:bg-ink-2">
            ← City
          </Link>
        ) : null}
        <Link to="/me" className="chip mono hover:bg-ink-2">
          {live ? (
            <>
              <Dot tone="cyan" />
              {shortAddress(fan.address)}
              {devSeed ? <span className="text-muted">dev</span> : null}
            </>
          ) : knownAddress ? (
            <>
              <Dot tone="muted" />
              {shortAddress(knownAddress)}
            </>
          ) : (
            <>
              <Dot tone="muted" />
              Passport
            </>
          )}
        </Link>
        {!live ? (
          <button
            type="button"
            className="chip mono hover:bg-ink-2"
            onClick={onSignIn}
            disabled={busy !== null}
          >
            {busy ? "…" : knownAddress ? "Sign in" : "New passkey"}
          </button>
        ) : null}
      </div>
    </header>
  );
}

/** Taps · seconds to the first confirmed ticket. Sits top-centre, small, always honest. */
export function Readout({ config }: { config: AppConfig | undefined }) {
  const taps = useTelemetry((s) => s.taps);
  const landedAt = useTelemetry((s) => s.landedAt);
  const firstConfirmedAt = useTelemetry((s) => s.firstConfirmedAt);
  const firstConfirmedTaps = useTelemetry((s) => s.firstConfirmedTaps);
  const lastCeremonyMs = useIdentity((s) => s.lastCeremonyMs);
  const [, tick] = useState(0);
  useEffect(() => {
    if (firstConfirmedAt !== null) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [firstConfirmedAt]);
  const elapsed = (firstConfirmedAt ?? performance.now()) - landedAt;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-30 hidden justify-center gap-1 lg:flex">
      <div className="chip mono">
        <span className={firstConfirmedAt ? "text-green" : "text-muted"}>
          {firstConfirmedAt ? "ticket" : "landing"} · {firstConfirmedTaps ?? taps} taps · {formatMs(elapsed)}
        </span>
      </div>
      {lastCeremonyMs !== null && lastCeremonyMs > 0 ? (
        <div className="chip mono text-muted">passkey {formatMs(lastCeremonyMs)}</div>
      ) : null}
      {config ? (
        <div className="chip mono text-muted">{config.relayer ? "sponsored by relayer" : ""}</div>
      ) : null}
    </div>
  );
}

export function ErrorToast() {
  const error = useIdentity((s) => s.error);
  const clear = useIdentity((s) => s.clearError);
  if (!error) return null;
  return (
    <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="glass fade-up flex max-w-md items-start gap-3 rounded-2xl px-4 py-3">
        <Dot tone="red" />
        <div className="flex-1">
          <div className="text-sm">{error.title}</div>
          <div className="text-xs text-muted">{error.hint}</div>
          <Kicker className="mt-1">{error.code}</Kicker>
        </div>
        <button type="button" className="text-muted hover:text-paper" onClick={clear} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}

export function ConnectionNotice({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <div className="fixed inset-x-0 top-20 z-40 flex justify-center px-4">
      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-sm">
        <Dot tone="red" />
        Can't reach the relayer — is <span className="mono">apps/relayer</span> running?
      </div>
    </div>
  );
}
