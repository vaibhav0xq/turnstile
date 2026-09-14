import { useQueries } from "@tanstack/react-query";
import { ACCOUNT_SESSION_TTL_MS } from "@turnstile/identity";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type AppConfig, tierForSeat } from "../../chain/config";
import { fetchSeatMap, mySeats, seatMapQueryKey } from "../../chain/seats";
import { useIdentity } from "../../identity/store";
import { formatCountdown, formatMon, shortAddress } from "../../lib/format";
import { useDirector } from "../../scene/director";
import { PassportHistory } from "../../ui/live/PassportHistory";
import { Button, Dot, Kicker, Panel, Spinner } from "../../ui/primitives";
import { buildLayout, seatLabel } from "../../venues/layout";
import { usePassport } from "../passport";
import {
  NAME_MAX,
  NOTE_MAX,
  noteKey,
  type Passport,
  samePassport,
  withName,
  withNote,
} from "../passport-model";

export function Me({ config }: { config: AppConfig | undefined }) {
  const showCity = useDirector((s) => s.showCity);
  const fan = useIdentity((s) => s.fan);
  const knownAddress = useIdentity((s) => s.knownAddress);
  const knownCredentialId = useIdentity((s) => s.knownCredentialId);
  const busy = useIdentity((s) => s.busy);
  const devSeed = useIdentity((s) => s.devSeed);
  const signIn = useIdentity((s) => s.signIn);
  const create = useIdentity((s) => s.create);
  const endSessions = useIdentity((s) => s.endSessions);
  const forgetDevice = useIdentity((s) => s.forgetDevice);
  const setDevSeed = useIdentity((s) => s.setDevSeed);
  const passport = usePassport();
  const [draft, setDraft] = useState<Passport | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    showCity();
  }, [showCity]);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const live = fan && fan.expiresAt > Date.now() ? fan : null;
  const address = live?.address ?? knownAddress;
  const vaultOpen = passport.status === "open" || passport.status === "saving";
  // The draft follows the decrypted passport: (re)opened → reset; closed → dropped.
  useEffect(() => {
    setDraft(passport.data);
  }, [passport.data]);
  const dirty = Boolean(draft && passport.data && !samePassport(draft, passport.data));

  const tickets = useQueries({
    queries: (config?.events ?? []).map((event) => ({
      queryKey: seatMapQueryKey(event.address),
      queryFn: () => (config ? fetchSeatMap(config, event) : Promise.reject(new Error("no config"))),
      enabled: Boolean(config && address),
      staleTime: 5_000,
    })),
  });

  return (
    <div className="overlay flex items-end justify-start p-4 pt-20 sm:items-start sm:justify-center sm:p-6 sm:pt-24">
      <Panel className="glass-solid fade-up scrollbar-none max-h-[calc(100dvh-6rem)] w-full max-w-md overflow-y-auto p-5 sm:max-h-[calc(100dvh-7.5rem)]">
        <Kicker>Passport</Kicker>
        <div className="display mt-1 text-3xl" data-testid="passport-title">
          {vaultOpen && passport.data?.name
            ? passport.data.name
            : address
              ? shortAddress(address, 6)
              : "No passkey yet"}
        </div>
        <div className="mono mt-1 text-xs text-muted">
          {live
            ? `session live · ${formatCountdown(live.expiresAt - Date.now())} left`
            : knownCredentialId
              ? "passkey known on this device · signed out"
              : "one passkey becomes your account, your door key and your private vault"}
        </div>
        {live ? (
          <p className="mt-1 text-[11px] text-muted">
            Buying keeps working for {Math.round(ACCOUNT_SESSION_TTL_MS / 60_000)} minutes after a prompt;
            after that the next tap asks your passkey again. Nothing is lost when it lapses.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {!live && knownCredentialId ? (
            <Button variant="primary" onClick={() => void signIn()} disabled={busy !== null}>
              {busy === "signin" ? <Spinner /> : null} Sign in
            </Button>
          ) : null}
          {!live ? (
            <Button
              variant={knownCredentialId ? "ghost" : "primary"}
              onClick={() => void create()}
              disabled={busy !== null}
            >
              {busy === "create" ? <Spinner /> : null} {knownCredentialId ? "New passkey" : "Create passkey"}
            </Button>
          ) : (
            <Button onClick={endSessions}>End session</Button>
          )}
          {knownCredentialId ? (
            <Button
              onClick={forgetDevice}
              title="Stateless test: forget everything this device knows; the passkey stays in the platform"
            >
              Forget this device
            </Button>
          ) : null}
        </div>

        <details
          className="group mt-3 rounded-xl border border-line px-3 py-2"
          data-testid="passkey-explainer"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm">
            <span>What is a passkey?</span>
            <span className="mono text-muted transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <div className="mt-2 flex flex-col gap-2 text-xs text-muted">
            <p>
              A key your phone or laptop makes and keeps — unlocked with your face, fingerprint or device PIN.
              There is no password to remember and nothing to install. Most password managers (Apple, Google,
              Microsoft) sync it between your own devices; a security key or a locked-down manager keeps it on
              one.
            </p>
            <p>
              Here one passkey does three jobs. It signs as your account on Monad, so a seat is minted to you
              with no wallet. It derives a door key that exists for one event only, which signs the code you
              show at the gate. And it opens your private vault, which only that passkey can read.
            </p>
            <p>
              You will see a prompt when you buy, once more when the door key is made, and again after a
              session lapses. A prompt on someone else's device does nothing: the key never leaves yours.
            </p>
          </div>
        </details>

        {import.meta.env.DEV ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span className="mono">dev identity</span>
            <button
              type="button"
              className="chip mono hover:bg-ink-2"
              onClick={() => setDevSeed(devSeed ? null : "fan-1")}
            >
              {devSeed ? `on · ${devSeed}` : "off"}
            </button>
            {devSeed ? (
              <button
                type="button"
                className="chip mono hover:bg-ink-2"
                onClick={() => setDevSeed(devSeed === "fan-1" ? "fan-2" : "fan-1")}
              >
                switch
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Kicker>Private vault</Kicker>
              <div className="mono mt-0.5 text-[11px] text-muted">
                {vaultOpen
                  ? `open · ${passport.syncedAt ? `synced ${new Date(passport.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "nothing stored yet"}`
                  : "locked · AES-256-GCM under your passkey's vault key"}
              </div>
            </div>
            {vaultOpen ? (
              <Button className="!min-h-9 px-3 text-xs" onClick={passport.close} data-testid="passport-lock">
                Lock
              </Button>
            ) : (
              <Button
                variant="primary"
                className="!min-h-9 whitespace-nowrap px-3 text-xs"
                onClick={() => void passport.open().catch(() => undefined)}
                disabled={passport.status === "opening" || busy !== null}
                data-testid="passport-open"
              >
                {passport.status === "opening" ? <Spinner /> : null} Open vault
              </Button>
            )}
          </div>
          {vaultOpen && draft ? (
            <div className="mt-3">
              <input
                className="field"
                value={draft.name}
                maxLength={NAME_MAX}
                placeholder="What should this passport call you?"
                onChange={(e) => setDraft(withName(draft, e.target.value))}
                aria-label="Passport name"
                data-testid="passport-name"
              />
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="primary"
                  className="!min-h-9 px-3 text-xs"
                  disabled={!dirty || passport.status === "saving"}
                  onClick={() => void passport.save(draft).catch(() => undefined)}
                  data-testid="passport-save"
                >
                  {passport.status === "saving" ? <Spinner /> : null} Save passport
                </Button>
                <span className="text-[11px] text-muted">
                  {dirty
                    ? "Encrypted here, signed by your account key, stored as ciphertext."
                    : "Up to date."}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">
              A name and a line about each night, readable only after a passkey prompt — on any device, after
              a wipe. The relayer keeps the ciphertext and cannot open it.
            </p>
          )}
          {passport.error ? (
            <div className="mt-2 text-xs text-red" data-testid="passport-error">
              {passport.error}
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          <Kicker>Your tickets</Kicker>
          {!address ? (
            <div className="mt-2 text-sm text-muted">Sign in to see the seats bound to your passkey.</div>
          ) : null}
          <ul className="mt-2 flex flex-col gap-2">
            {config?.events.map((event, i) => {
              const q = tickets[i];
              const mine = mySeats(q?.data, address ?? undefined);
              if (!q || (!q.data && !q.isLoading)) return null;
              if (q.isLoading) {
                return (
                  <li key={event.address} className="flex items-center gap-2 text-xs text-muted">
                    <Spinner /> {event.name}
                  </li>
                );
              }
              if (mine.length === 0) return null;
              const layout = buildLayout(event);
              return mine.map((s) => {
                const spec = layout.byId.get(s.id);
                const tier = tierForSeat(event, s.id);
                const key = config ? noteKey(config.chainId, event.address, s.id) : "";
                return (
                  <li key={`${event.address}-${s.id}`} className="rounded-xl border border-line">
                    <Link
                      to={`/t/${event.address}/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-ink-2"
                    >
                      <div>
                        <div className="text-sm">{event.name}</div>
                        <div className="mono text-[11px] text-muted">
                          {spec ? seatLabel(spec) : `Seat ${s.id}`} · {tier?.name}
                          {s.listed ? (
                            <span className="text-cyan"> · listed {formatMon(s.listingPrice)}</span>
                          ) : null}
                        </div>
                      </div>
                      <Dot
                        tone={
                          s.checkedInAt > 0
                            ? "green"
                            : s.doorKey.endsWith("0000000000000000")
                              ? "amber"
                              : "cyan"
                        }
                      />
                    </Link>
                    {vaultOpen && draft ? (
                      <div className="border-line border-t px-3 py-2">
                        <input
                          className="field !min-h-8 text-xs"
                          value={draft.notes[key]?.text ?? ""}
                          maxLength={NOTE_MAX}
                          placeholder={
                            s.checkedInAt > 0 ? "How was it? (private)" : "A note to yourself (private)"
                          }
                          onChange={(e) => setDraft(withNote(draft, key, e.target.value, Date.now()))}
                          aria-label={`Note for ${event.name} seat ${s.id}`}
                          data-testid={`passport-note-${s.id}`}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              });
            })}
          </ul>
          {address &&
          tickets.every((q) => q.data) &&
          tickets.every((q, i) => mySeats(q.data, address).length === 0 && config?.events[i]) ? (
            <div className="mt-2 text-sm text-muted">
              Nothing yet.{" "}
              <Link to="/city" className="underline">
                Pick a night.
              </Link>
            </div>
          ) : null}
        </div>

        <PassportHistory config={config} address={address ?? null} />
      </Panel>
    </div>
  );
}
