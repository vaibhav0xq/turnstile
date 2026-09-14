import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useDirector } from "../../scene/director";
import { Kicker } from "../../ui/primitives";

/** Unknown URL: keep the city behind it and offer the way back rather than an empty overlay. */
export function NotFound() {
  const showCity = useDirector((s) => s.showCity);
  const { pathname } = useLocation();
  useEffect(() => {
    showCity();
  }, [showCity]);
  return (
    <div className="overlay grid place-items-center p-4">
      <div className="glass fade-up max-w-sm rounded-2xl p-6 text-center">
        <Kicker>404</Kicker>
        <div className="display mt-2 text-3xl">No door here</div>
        <p className="mt-2 text-sm text-muted">
          <span className="mono break-all">{pathname}</span> isn't a page. Tickets live at{" "}
          <span className="mono">/t/…</span>, events at <span className="mono">/e/…</span>.
        </p>
        <Link to="/" className="chip mono mt-5 inline-flex border-amber/50 text-amber hover:bg-ink-2">
          ← Back to the city
        </Link>
      </div>
    </div>
  );
}
