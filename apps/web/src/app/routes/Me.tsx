import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type AppConfig, tierForSeat } from "../../chain/config";
import { fetchSeatMap, mySeats, seatMapQueryKey } from "../../chain/seats";
import { useIdentity } from "../../identity/store";
import { formatCountdown, shortAddress } from "../../lib/format";
import { useDirector } from "../../scene/director";
import { Button, Dot, Kicker, Panel, Spinner } from "../../ui/primitives";
import { buildLayout, seatLabel } from "../../venues/layout";

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

  const tickets = useQueries({
    queries: (config?.events ?? []).map((event) => ({
      queryKey: seatMapQueryKey(event.address),
      queryFn: () => (config ? fetchSeatMap(config, event) : Promise.reject(new Error("no config"))),
      enabled: Boolean(config && address),
      staleTime: 5_000,
    })),
  });

  return (
    <div className="overlay flex items-end justify-start p-4 sm:items-center sm:justify-center sm:p-6">
      <Panel className="fade-up w-full max-w-md p-5">
        <Kicker>Passport</Kicker>
        <div className="display mt-1 text-3xl">{address ? shortAddress(address, 6) : "No passkey yet"}</div>
        <div className="mono mt-1 text-xs text-muted">
          {live
            ? `session live · ${formatCountdown(live.expiresAt - Date.now())} left`
            : knownCredentialId
              ? "passkey known on this device · signed out"
              : "one passkey becomes your account, your door key and your private vault"}
        </div>

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
                return (
                  <li key={`${event.address}-${s.id}`}>
                    <Link
                      to={`/t/${event.address}/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 hover:bg-ink-2"
                    >
                      <div>
                        <div className="text-sm">{event.name}</div>
                        <div className="mono text-[11px] text-muted">
                          {spec ? seatLabel(spec) : `Seat ${s.id}`} · {tier?.name}
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
              <Link to="/" className="underline">
                Pick a night.
              </Link>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
