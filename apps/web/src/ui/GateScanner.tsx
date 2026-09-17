import { entryCodeForm } from "@turnstile/identity/entry";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EventInfo } from "../chain/config";
import { ApiError } from "../lib/api";
import { formatAgo, formatMs, shortAddress } from "../lib/format";
import { type GateResult, gateCheckIn, gateLookup } from "../relayer/client";
import { Button, Dot, Kicker, Panel, Spinner } from "./primitives";

interface GateScannerProps {
  event: EventInfo;
  /** A code carried over from the ticket view (one-device demo): looked up on arrival, camera stays off. */
  initialCode?: string | undefined;
  /** Operator bearer token for a protected door; null = none set. */
  token?: string | null;
  /** The relayer requires a token for check-in (`/api/config.gateProtected`). */
  tokenRequired?: boolean;
  onToken?: (token: string | null) => void;
  onAdmitted?: (result: GateResult) => void;
}

type Phase =
  | { kind: "scanning" }
  | { kind: "checking"; code: string }
  | { kind: "result"; result: GateResult; code: string; at: number };

interface Recent {
  at: number;
  ok: boolean;
  label: string;
  detail: string;
}

/** Camera → QR → relayer. Works with a pasted code too, which is also what the e2e test drives. */
export function GateScanner({
  event,
  initialCode,
  token = null,
  tokenRequired = false,
  onToken,
  onAdmitted,
}: GateScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [wantCamera, setWantCamera] = useState(!initialCode);
  const [camera, setCamera] = useState<"idle" | "on" | "denied" | "unsupported" | "off">(
    initialCode ? "off" : "idle",
  );
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [recent, setRecent] = useState<Recent[]>([]);
  const [manual, setManual] = useState(initialCode ?? "");
  const [preview, setPreview] = useState<GateResult | null>(null);
  const lastCode = useRef<string | null>(null);
  const autoAdmit = useRef(true);
  const [tokenDraft, setTokenDraft] = useState("");
  const [unauthorised, setUnauthorised] = useState(false);
  const needsToken = (tokenRequired || unauthorised) && !token;
  const manualField = useRef<HTMLInputElement>(null);
  // No camera: the operator types, so the cursor is already in the field.
  useEffect(() => {
    if (camera === "denied" || camera === "unsupported") manualField.current?.focus();
  }, [camera]);
  // The "ago" column ticks over on its own.
  const [, tick] = useState(0);
  useEffect(() => {
    if (recent.length === 0) return;
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [recent.length]);

  const submit = useCallback(
    async (code: string) => {
      if (phase.kind === "checking") return;
      setPhase({ kind: "checking", code });
      const started = performance.now();
      let result: GateResult;
      try {
        result = await gateCheckIn(code, token ?? undefined);
      } catch (error) {
        result =
          error instanceof ApiError
            ? { ok: false, code: error.code, message: error.message, ...(error.details as object) }
            : { ok: false, code: "NETWORK", message: error instanceof Error ? error.message : String(error) };
      }
      const ms = result.ms ?? Math.round(performance.now() - started);
      if (result.code === "UNAUTHORIZED") {
        // Wrong or missing operator token: forget it and ask for one instead of retrying with it.
        setUnauthorised(true);
        onToken?.(null);
      }
      setPhase({ kind: "result", result: { ...result, ms }, code, at: Date.now() });
      setRecent((r) =>
        [
          {
            at: Date.now(),
            ok: result.ok,
            label: result.tokenId
              ? `Seat ${result.tokenId}${result.tier ? ` · ${result.tier.name}` : ""}`
              : (result.code ?? "?"),
            detail: result.ok ? `admitted · ${formatMs(ms)}` : (result.message ?? result.code ?? "rejected"),
          },
          ...r,
        ].slice(0, 8),
      );
      if (result.ok) onAdmitted?.(result);
      setTimeout(
        () => {
          setPhase({ kind: "scanning" });
          lastCode.current = null;
        },
        result.ok ? 2600 : 3600,
      );
    },
    [phase.kind, onAdmitted, onToken, token],
  );

  // Camera + detector loop.
  useEffect(() => {
    if (!wantCamera) return;
    let stream: MediaStream | null = null;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("unsupported");
        return;
      }
      try {
        const { BarcodeDetector } = await import("barcode-detector/ponyfill");
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stop) return;
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setCamera("on");
        const tick = async () => {
          if (stop) return;
          try {
            if (v.readyState >= 2) {
              const codes = await detector.detect(v);
              const hit = codes.find((c) => entryCodeForm(c.rawValue) !== null);
              if (hit && hit.rawValue !== lastCode.current && autoAdmit.current) {
                lastCode.current = hit.rawValue;
                void submit(hit.rawValue);
              }
            }
          } catch {
            // detector hiccup; keep scanning
          }
          timer = setTimeout(() => void tick(), 220);
        };
        void tick();
      } catch {
        setCamera("denied");
      }
    })();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, [submit, wantCamera]);

  const lookup = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    try {
      setPreview(await gateLookup(code));
    } catch (error) {
      setPreview(
        error instanceof ApiError
          ? { ok: false, code: error.code, message: error.message, ...(error.details as object) }
          : { ok: false, code: "NETWORK", message: String(error) },
      );
    }
  }, []);

  // A code handed over from the ticket view is looked up straight away; the door operator taps Admit.
  useEffect(() => {
    if (initialCode) void lookup(initialCode);
  }, [initialCode, lookup]);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <Panel className="overflow-hidden">
        <div className="scan-frame">
          <video ref={video} muted playsInline aria-label="Camera" />
          {camera === "on" && phase.kind === "scanning" ? <div className="scan-beam" /> : null}
          {camera !== "on" ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
              {camera === "idle" ? (
                "Starting camera…"
              ) : camera === "denied" ? (
                "Camera blocked. Allow access or enter the code below."
              ) : camera === "off" ? (
                <button
                  type="button"
                  className="chip mono hover:bg-ink-2"
                  onClick={() => {
                    setCamera("idle");
                    setWantCamera(true);
                  }}
                >
                  Start camera
                </button>
              ) : (
                "No camera on this device. Enter a code below."
              )}
            </div>
          ) : null}
          <div aria-live="assertive" aria-atomic="true">
            {phase.kind !== "scanning" ? <Verdict phase={phase} /> : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <Kicker>Door · {event.name}</Kicker>
            <div className="mono mt-0.5 text-xs text-muted">
              {camera === "on"
                ? "Point at the fan's code"
                : initialCode
                  ? "Code from your ticket"
                  : "Manual entry"}
            </div>
          </div>
          <Dot tone={camera === "on" ? "green" : "muted"} />
        </div>
      </Panel>

      {needsToken ? (
        <Panel className="p-4">
          <Kicker>Operator token</Kicker>
          <p className="mt-1 text-xs text-muted">
            {unauthorised
              ? "Token rejected. Enter the correct operator token."
              : "Enter the operator token before admitting fans."}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              className="field mono text-xs"
              type="password"
              placeholder="Operator token"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tokenDraft.trim()) {
                  onToken?.(tokenDraft.trim());
                  setUnauthorised(false);
                  setTokenDraft("");
                }
              }}
              aria-label="Operator token"
              autoComplete="off"
            />
            <Button
              className="whitespace-nowrap"
              disabled={!tokenDraft.trim()}
              onClick={() => {
                onToken?.(tokenDraft.trim());
                setUnauthorised(false);
                setTokenDraft("");
              }}
            >
              Use token
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel className="p-4">
        <div className="flex gap-2">
          <input
            ref={manualField}
            className="field mono text-xs"
            placeholder="TS3:… (TS2:… and TS1|… also work)"
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              setPreview(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookup(manual);
            }}
            aria-label="Entry code"
          />
          <Button className="whitespace-nowrap" onClick={() => void lookup(manual)} disabled={!manual.trim()}>
            Look up
          </Button>
        </div>
        {preview ? (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-line p-3">
            <div>
              <div className="text-sm">
                {preview.tokenId ? `Seat ${preview.tokenId}` : preview.code}
                {preview.tier ? <span className="text-muted"> · {preview.tier.name}</span> : null}
              </div>
              <div className="mono mt-0.5 text-[11px] text-muted">
                {preview.ok
                  ? `holder ${preview.holder ? shortAddress(preview.holder) : "?"} · ready to admit`
                  : (preview.message ?? preview.code)}
              </div>
            </div>
            {preview.ok ? (
              <Button
                variant="amber"
                className="!min-h-9 px-3 text-xs"
                onClick={() => void submit(manual.trim())}
                data-tour="door"
                data-testid="gate-admit"
              >
                Admit
              </Button>
            ) : (
              <Dot tone="red" />
            )}
          </div>
        ) : null}
      </Panel>

      {recent.length ? (
        <Panel className="p-4">
          <Kicker>Tonight · last {recent.length === 1 ? "one" : recent.length}</Kicker>
          <ul className="mt-2 flex flex-col gap-1.5">
            {recent.map((r) => (
              <li key={r.at} className="flex items-center gap-3 text-sm">
                <Dot tone={r.ok ? "green" : "red"} />
                <span>{r.label}</span>
                <span className="mono ml-auto text-[11px] text-muted">
                  {r.detail} · {formatAgo(r.at)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function Verdict({ phase }: { phase: Phase }) {
  if (phase.kind === "checking") {
    return (
      <div className="absolute inset-0 grid place-items-center bg-ink/70">
        <div className="flex items-center gap-3 text-sm">
          <Spinner /> verifying on Monad…
        </div>
      </div>
    );
  }
  if (phase.kind !== "result") return null;
  const { result } = phase;
  return (
    <div
      className={`absolute inset-0 grid place-items-center p-6 text-center ${result.ok ? "bg-green/90 text-ink" : "bg-red/90 text-ink"}`}
    >
      <div>
        <div className="display text-5xl">{result.ok ? "Go in." : "Stop."}</div>
        <div className="mono mt-2 text-sm">
          {result.tokenId ? `Seat ${result.tokenId}` : ""}
          {result.tier ? ` · ${result.tier.name}` : ""}
        </div>
        <div className="mt-1 text-sm opacity-80">
          {result.ok ? `checked in · ${formatMs(result.ms ?? 0)}` : (result.message ?? result.code)}
        </div>
        {!result.ok && result.code ? (
          <div className="mono mt-1 text-[11px] opacity-70">{result.code}</div>
        ) : null}
      </div>
    </div>
  );
}
