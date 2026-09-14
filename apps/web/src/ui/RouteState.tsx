import { useNavigate } from "react-router";
import { Button, Kicker } from "./primitives";

/** Config or the venue is still on its way: say so instead of leaving the overlay empty. */
export function RouteLoading({ label = "Finding the venue…" }: { label?: string }) {
  return (
    <div className="overlay grid place-items-center" aria-live="polite">
      <div className="chip mono fade-up text-muted">{label}</div>
    </div>
  );
}

/** The address (or seat) in the URL is not one the relayer knows. */
export function UnknownRoute({ title, detail }: { title: string; detail: string }) {
  const navigate = useNavigate();
  return (
    <div className="overlay grid place-items-center p-4">
      <div className="glass fade-up max-w-sm rounded-2xl p-6 text-center">
        <Kicker>Not found</Kicker>
        <div className="display mt-2 text-2xl">{title}</div>
        <p className="mt-2 text-sm text-muted">{detail}</p>
        <Button className="mt-4" onClick={() => navigate("/city")}>
          Back to the city
        </Button>
      </div>
    </div>
  );
}

export const unknownEvent = {
  title: "No event at this address",
  detail: "Nothing the relayer knows lives at this address on this chain. It may belong to another network.",
};
