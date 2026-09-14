import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router";
import type { AppConfig } from "../../chain/config";
import { useDirector } from "../../scene/director";
import { SiteSections } from "../../ui/site/Sections";
import { Story } from "../../ui/site/Story";

/**
 * The front door: a scroll-driven flight over the city that ends on the picker's pose, then the programme.
 * Judge links (`/?tour=auto`, `/?event=…`) were minted before the picker moved to `/city`; they redirect
 * there with their query intact, before the tour consumes it.
 */
export function Landing({ config }: { config: AppConfig | undefined }) {
  const { search } = useLocation();
  if (/[?&](tour|event)=/.test(search)) return <Navigate to={`/city${search}`} replace />;
  return <StoryLanding config={config} />;
}

function StoryLanding({ config }: { config: AppConfig | undefined }) {
  const showCity = useDirector((s) => s.showCity);
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    showCity();
  }, [showCity]);
  return (
    <div
      ref={overlay}
      className="overlay flex flex-col overflow-y-auto overscroll-contain"
      data-testid="landing"
    >
      <div className="scrim-bottom" aria-hidden />
      <Story config={config} overlay={overlay} />
      <SiteSections config={config} />
    </div>
  );
}
