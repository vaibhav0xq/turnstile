// The organiser's side: publish an event from a passkey and watch its door. No dashboard chrome — one panel
// over the city, the same primitives as the passport.
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { formatEther } from "viem";
import { type AppConfig, type EventInfo, explorerTx } from "../../chain/config";
import { useIdentity } from "../../identity/store";
import { formatDate, shortAddress } from "../../lib/format";
import { useDirector } from "../../scene/director";
import { Button, Kicker, Panel, Spinner } from "../../ui/primitives";
import {
  createEventGas,
  type DraftIssue,
  defaultDraft,
  type EventDraft,
  MAX_TIERS,
  type TierDraft,
  validateDraft,
} from "../event-draft";
import { useOrganise } from "../organise";

const VENUES: Array<{ id: EventDraft["venue"]; label: string; hint: string }> = [
  { id: "club", label: "Club", hint: "1st tier fills the floor, 2nd the booths, the rest the gallery." },
  { id: "theatre", label: "Theatre", hint: "Tiers become stalls, circle and balcony in that order." },
];

const STEP_COPY: Record<string, string> = {
  identity: "Confirm with your passkey…",
  funding: "Topping up your account for gas…",
  creating: "Publishing on Monad…",
};

export function Organise({ config }: { config: AppConfig | undefined }) {
  const showCity = useDirector((s) => s.showCity);
  const fan = useIdentity((s) => s.fan);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const step = useOrganise((s) => s.step);
  const error = useOrganise((s) => s.error);
  const hash = useOrganise((s) => s.hash);
  const publish = useOrganise((s) => s.publish);
  const reset = useOrganise((s) => s.reset);
  const [draft, setDraft] = useState<EventDraft>(() => defaultDraft());
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    showCity();
    return () => reset();
  }, [showCity, reset]);

  const live = fan && fan.expiresAt > Date.now() ? fan : null;
  const mine = useMemo(
    () =>
      config && live
        ? config.events.filter((e) => e.organiser.toLowerCase() === live.address.toLowerCase())
        : [],
    [config, live],
  );
  const issues = useMemo(() => validateDraft(draft), [draft]);
  const busy = step === "identity" || step === "funding" || step === "creating";
  const issueFor = (field: DraftIssue["field"]) =>
    touched ? issues.find((i) => i.field === field)?.message : undefined;

  const update = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateTier = (index: number, patch: Partial<TierDraft>) =>
    setDraft((d) => ({ ...d, tiers: d.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)) }));

  const submit = async () => {
    setTouched(true);
    if (!config || issues.length > 0 || busy) return;
    const address = await publish(config, draft, queryClient);
    if (address) navigate(`/e/${address}`);
  };

  return (
    <div className="overlay flex items-end justify-start p-4 sm:items-center sm:justify-center sm:p-6">
      <Panel className="glass-solid fade-up flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden">
        <div className="scrollbar-none overflow-y-auto p-5">
          <Kicker>Organiser</Kicker>
          <div className="display mt-1 text-3xl">Host a night</div>
          <p className="mt-1 text-sm text-muted">
            Publish an event from your passkey. Fans take seats with one tap; the door checks them in with
            this deployment's gate key. Publishing is the one thing here that costs gas — on testnet the
            relayer tops you up.
          </p>

          {mine.length > 0 ? (
            <div className="mt-5" data-testid="organiser-events">
              <Kicker>Your events</Kicker>
              <ul className="mt-2 flex flex-col gap-2">
                {mine.map((event) => (
                  <OrganiserEvent key={event.address} event={event} />
                ))}
              </ul>
            </div>
          ) : null}

          <form
            className="mt-5 flex flex-col gap-4"
            data-testid="organise-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="Name" issue={issueFor("name")}>
              <input
                className="field"
                data-testid="organise-name"
                placeholder="Neon Night at Metropolis"
                value={draft.name}
                maxLength={64}
                onChange={(e) => update({ name: e.target.value })}
              />
            </Field>

            <Field label="Venue" hint={VENUES.find((v) => v.id === draft.venue)?.hint}>
              <div className="flex gap-2">
                {VENUES.map((venue) => (
                  <button
                    key={venue.id}
                    type="button"
                    className={`chip mono ${draft.venue === venue.id ? "border-amber/70 text-amber" : "hover:bg-ink-2"}`}
                    onClick={() => update({ venue: venue.id })}
                  >
                    {venue.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Doors open"
              issue={issueFor("startsAt")}
              hint="Resale closes at doors; sales too, unless you set an earlier cut-off later."
            >
              <input
                className="field"
                type="datetime-local"
                data-testid="organise-doors"
                value={toLocalInput(draft.startsAt)}
                onChange={(e) => {
                  const t = Date.parse(e.target.value);
                  if (!Number.isNaN(t)) update({ startsAt: Math.floor(t / 1000) });
                }}
              />
            </Field>

            <Field
              label="Tiers"
              hint="Seat numbers run 1…, 1001…, 2001… per tier. Price 0 makes a tier free and fully gasless for fans."
            >
              <div className="flex flex-col gap-2">
                {draft.tiers.map((tier, index) => (
                  <div key={tier.key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <input
                        className="field min-w-0 flex-1"
                        placeholder="Tier name"
                        value={tier.name}
                        onChange={(e) => updateTier(index, { name: e.target.value })}
                      />
                      <label className="relative w-24 shrink-0">
                        <input
                          className="field with-suffix"
                          inputMode="decimal"
                          value={tier.priceMon}
                          onChange={(e) => updateTier(index, { priceMon: e.target.value })}
                          aria-label="Price in MON"
                        />
                        <span className="mono absolute inset-y-0 right-3 flex items-center text-[10px] text-muted">
                          MON
                        </span>
                      </label>
                      <label className="relative w-28 shrink-0">
                        <input
                          className="field with-suffix"
                          inputMode="numeric"
                          value={tier.seatCount}
                          onChange={(e) => updateTier(index, { seatCount: Number(e.target.value) })}
                          aria-label="Seats"
                        />
                        <span className="mono absolute inset-y-0 right-3 flex items-center text-[10px] text-muted">
                          seats
                        </span>
                      </label>
                      {draft.tiers.length > 1 ? (
                        <button
                          type="button"
                          className="chip mono hover:bg-ink-2"
                          aria-label="Remove tier"
                          onClick={() => update({ tiers: draft.tiers.filter((_, i) => i !== index) })}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                    {issueFor(`tier.${index}`) ? (
                      <div className="text-xs text-red">{issueFor(`tier.${index}`)}</div>
                    ) : null}
                  </div>
                ))}
                {draft.tiers.length < MAX_TIERS ? (
                  <button
                    type="button"
                    className="chip mono self-start hover:bg-ink-2"
                    data-testid="organise-add-tier"
                    onClick={() =>
                      update({
                        tiers: [
                          ...draft.tiers,
                          {
                            key: Math.max(0, ...draft.tiers.map((t) => t.key)) + 1,
                            name: "",
                            priceMon: "0.05",
                            seatCount: 40,
                          },
                        ],
                      })
                    }
                  >
                    + Add tier
                  </button>
                ) : null}
              </div>
            </Field>

            <Field
              label="Resale"
              issue={issueFor("resale")}
              hint="Cap is a percentage of face value; 0 % turns resale off. The fee is your cut of every resale."
            >
              <div className="flex gap-2">
                <label className="relative flex-1">
                  <input
                    className="field with-suffix"
                    inputMode="numeric"
                    value={draft.resaleCapPct}
                    onChange={(e) => update({ resaleCapPct: Number(e.target.value) })}
                    aria-label="Resale cap, percent of face"
                  />
                  <span className="mono absolute inset-y-0 right-3 flex items-center text-[10px] text-muted">
                    % cap
                  </span>
                </label>
                <label className="relative flex-1">
                  <input
                    className="field with-suffix"
                    inputMode="numeric"
                    value={draft.resaleFeePct}
                    onChange={(e) => update({ resaleFeePct: Number(e.target.value) })}
                    aria-label="Resale fee, percent"
                  />
                  <span className="mono absolute inset-y-0 right-3 flex items-center text-[10px] text-muted">
                    % fee
                  </span>
                </label>
              </div>
            </Field>

            <Field
              label="Door"
              hint="Whoever opens /gate/<event> on this deployment checks people in with this key. More gates can be granted on-chain later."
            >
              <div className="mono text-xs text-paper/80">{config ? config.gate : "…"}</div>
            </Field>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                type="submit"
                disabled={busy || !config}
                data-testid="organise-publish"
              >
                {busy ? <Spinner /> : null} {busy ? (STEP_COPY[step] ?? "Working…") : "Publish event"}
              </Button>
              <span className="mono text-[11px] text-muted">
                ≈ {config ? `${formatEther(createEventGas(draft) * 100_000_000_000n)} MON` : "…"} gas
                {config?.drip.enabled ? " · testnet drip covers it" : ""}
              </span>
            </div>
            {touched && issues.length > 0 ? (
              <div className="text-xs text-red" data-testid="organise-issues">
                {issues[0]?.message}
              </div>
            ) : null}
            {error ? (
              <div className="text-xs text-red" data-testid="organise-error">
                {error.message}
              </div>
            ) : null}
            {hash && config ? (
              <div className="mono text-[11px] text-muted">
                tx{" "}
                {explorerTx(config, hash) ? (
                  <a
                    className="underline"
                    href={explorerTx(config, hash) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortAddress(hash, 8)}
                  </a>
                ) : (
                  shortAddress(hash, 8)
                )}
              </div>
            ) : null}
          </form>
        </div>
      </Panel>
    </div>
  );
}

function OrganiserEvent({ event }: { event: EventInfo }) {
  const [copied, setCopied] = useState(false);
  const doorUrl = `${window.location.origin}/gate/${event.address}`;
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm">{event.name}</div>
        <div className="mono text-[11px] text-muted">
          {formatDate(event.startsAt)} · {event.sold}/{event.capacity} sold ·{" "}
          <span className="text-green">{event.checkedIn} inside</span>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Link to={`/e/${event.address}`} className="chip mono hover:bg-ink-2">
          Room
        </Link>
        <button
          type="button"
          className="chip mono hover:bg-ink-2"
          title={doorUrl}
          onClick={() => {
            void navigator.clipboard?.writeText(doorUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Door link"}
        </button>
      </div>
    </li>
  );
}

function Field({
  label,
  hint,
  issue,
  children,
}: {
  label: string;
  hint?: string | undefined;
  issue?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Kicker>{label}</Kicker>
      {children}
      {issue ? (
        <div className="text-xs text-red">{issue}</div>
      ) : hint ? (
        <div className="text-xs text-muted">{hint}</div>
      ) : null}
    </div>
  );
}

function toLocalInput(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
