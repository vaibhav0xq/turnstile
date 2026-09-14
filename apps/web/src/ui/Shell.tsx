import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useTour } from "../app/tour";
import { type AppConfig, chainName, explorerTx } from "../chain/config";
import { useIdentity } from "../identity/store";
import { environmentLabel } from "../lib/environment";
import { formatMs, shortAddress } from "../lib/format";
import { useTelemetry } from "../lib/telemetry";
import { useDirector } from "../scene/director";
import { Dot, Kicker } from "./primitives";

export function Curtain() {
  const curtain = useDirector((s) => s.curtain);
  const flash = useDirector((s) => s.flash);
  return (
    <>
      <div className="curtain" style={{ opacity: curtain ? 1 : 0 }} aria-hidden />
      {/* The flash rises fast at the bottom of the dive and lifts slowly off the descending room. */}
      <div
        className="flash"
        style={{ opacity: flash ? 1 : 0, transitionDuration: flash ? "240ms" : "720ms" }}
        aria-hidden
      />
    </>
  );
}

/** Boot veil: "Lighting the city…" until the world has drawn its first frame, then a 700 ms lift. */
export function Veil() {
  const ready = useDirector((s) => s.ready);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setGone(true), 750);
    return () => clearTimeout(id);
  }, [ready]);
  if (gone) return null;
  return (
    <div className="veil" style={{ opacity: ready ? 0 : 1 }} aria-hidden={ready} role="status">
      <div>
        <div className="mono text-xs text-muted">Lighting the city…</div>
        <div className="veil-bar mt-2" />
      </div>
    </div>
  );
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
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-6">
      <Link
        to="/"
        className="pointer-events-auto flex min-w-0 items-center gap-2 sm:gap-3"
        aria-label="Turnstile — back to the city"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-ink-2/70">
          <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="17" fill="none" stroke="#ffb457" strokeWidth="4" />
            <path d="M32 15v34M15 32h34" stroke="#ffb457" strokeWidth="4" strokeLinecap="round" />
            <circle cx="32" cy="32" r="5" fill="#7ee7ff" />
          </svg>
        </span>
        <span className={`${envLabel ? "hidden sm:flex" : "flex"} flex-col leading-tight`}>
          <span className="display text-xl">Turnstile</span>
          <span className="mono hidden text-[10px] uppercase tracking-[0.2em] text-muted sm:block">
            {config ? chainName(config.chainId) : "connecting"}
          </span>
        </span>
        {envLabel ? (
          <span
            className="chip mono shrink-0 border-amber/60 bg-amber/10 text-[10px] uppercase tracking-[0.2em] text-amber"
            title="Internal rehearsal origin — not the final host. Passkeys made here stay here."
            data-testid="environment-label"
          >
            {envLabel}
          </span>
        ) : null}
      </Link>

      <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {!home ? (
          // On a phone the wordmark is the way back; the chip would push the actions onto a second line.
          // (`.chip` is unlayered CSS, so the display utility has to sit on a wrapper.)
          <span className="hidden sm:contents">
            <Link to="/" className="chip mono hover:bg-ink-2">
              ← City
            </Link>
          </span>
        ) : null}
        <Link to="/me" className="chip mono hover:bg-ink-2" aria-label="Passport">
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
  // The finale types the check-in's transaction hash: the chain truth the lit seat stands on.
  const admitHash = useTour((s) => (s.step === "lit" ? s.receipt.admitHash : null));
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
      {config && !admitHash ? (
        <div className="chip mono text-muted">{config.relayer ? "sponsored by relayer" : ""}</div>
      ) : null}
      {admitHash ? (
        <div className="chip mono text-muted" data-testid="readout-admit">
          <span className="text-green">admit</span>&nbsp;
          <Typed text={admitHash} href={config ? explorerTx(config, admitHash) : null} />
        </div>
      ) : null}
    </div>
  );
}

/** Types a string out one character at a time, 18 ms each, with a caret until it is complete. */
function Typed({ text, href }: { text: string; href: string | null }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    const id = setInterval(() => {
      setN((k) => {
        if (k + 1 >= text.length) clearInterval(id);
        return Math.min(text.length, k + 1);
      });
    }, 18);
    return () => clearInterval(id);
  }, [text]);
  const shown = text.slice(0, n);
  const done = n >= text.length;
  const body = (
    <>
      {shown}
      {done ? null : <span className="text-amber">▍</span>}
    </>
  );
  return href && done ? (
    <a href={href} target="_blank" rel="noreferrer" className="pointer-events-auto hover:text-paper">
      {body}
    </a>
  ) : (
    <span>{body}</span>
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
