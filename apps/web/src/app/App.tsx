import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router";
import { configQueryKey, findEvent, useConfig } from "../chain/config";
import { useSeatMap } from "../chain/seats";
import { useIdentity } from "../identity/store";
import { installTapCounter } from "../lib/telemetry";
import { WorldBoundary } from "../scene/boundary";
import { useDirector } from "../scene/director";
import { PerfHud } from "../ui/PerfHud";
import { SeatCardLayer } from "../ui/SeatCard";
import { ConnectionNotice, Curtain, ErrorToast, Readout, TopBar, Veil } from "../ui/Shell";
import { Tour } from "../ui/Tour";
import { buildLayout } from "../venues/layout";
import { useOrganise } from "./organise";
import { usePassport } from "./passport";
import { City } from "./routes/City";
import { Event } from "./routes/Event";
import { Gate } from "./routes/Gate";
import { Landing } from "./routes/Landing";
import { Me } from "./routes/Me";
import { NotFound } from "./routes/NotFound";
import { Organise } from "./routes/Organise";
import { Ticket } from "./routes/Ticket";
import { useTour } from "./tour";

// The whole three stack rides in this one chunk; the veil stays down until its first frame, so the
// shell, fonts and copy paint while it downloads instead of after.
const World = lazy(() => import("../scene/World"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Frame />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Frame() {
  const config = useConfig();
  const navigate = useNavigate();
  const chapter = useDirector((s) => s.chapter);
  const eventAddress = useDirector((s) => s.eventAddress);
  const ensureFan = useIdentity((s) => s.ensureFan);
  const goFlat = useDirector((s) => s.goFlat);
  // The taps · seconds readout is a judge-mode instrument: shown once the tour has been started this session.
  const judging = useTour((s) => s.startedAt !== null);
  const event = findEvent(config.data, eventAddress ?? undefined);
  const seats = useSeatMap(config.data, event, chapter !== "city");
  const layout = useMemo(() => (event ? buildLayout(event) : undefined), [event]);

  useEffect(() => {
    installTapCounter();
    if (import.meta.env.DEV) {
      // Dev probe for scripts/shoot.mjs: drive sign-in / purchase from --eval.
      const probe = window as unknown as {
        __identity?: unknown;
        __organise?: unknown;
        __passport?: unknown;
        __tour?: unknown;
        __app?: unknown;
      };
      probe.__identity = useIdentity;
      probe.__organise = useOrganise;
      probe.__passport = usePassport;
      probe.__tour = useTour;
      probe.__app = { queryClient, config: () => queryClient.getQueryData(configQueryKey) };
    }
  }, []);

  return (
    <>
      <WorldBoundary onFail={goFlat}>
        <Suspense fallback={<div className="world" aria-hidden />}>
          <World
            config={config.data}
            seatMap={seats.data}
            onEnterEvent={(address) => navigate(`/e/${address}`)}
          />
        </Suspense>
      </WorldBoundary>
      <SeatCardLayer event={event} layout={layout} seatMap={seats.data} />
      <Veil />
      <Curtain />
      <PerfHud />
      <TopBar config={config.data} onSignIn={() => void ensureFan().catch(() => undefined)} />
      <Routes>
        <Route path="/" element={<Landing config={config.data} />} />
        <Route path="/city" element={<City config={config.data} />} />
        <Route path="/e/:address" element={<Event config={config.data} seatMap={seats.data} />} />
        <Route path="/t/:address/:tokenId" element={<Ticket config={config.data} seatMap={seats.data} />} />
        <Route path="/gate/:address" element={<Gate config={config.data} seatMap={seats.data} />} />
        <Route path="/me" element={<Me config={config.data} />} />
        <Route path="/organise" element={<Organise config={config.data} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {judging ? <Readout config={config.data} /> : null}
      <Tour config={config.data} seatMap={seats.data} />
      <ErrorToast />
      <ConnectionNotice error={config.error} />
    </>
  );
}
