import type { ReactNode } from "react";
import { Link } from "react-router";
import type { AppConfig } from "../../chain/config";
import { Kicker } from "../primitives";
import { FAQ, FRAMES, ORGANISER_POINTS, WHY } from "./copy";
import { Footer } from "./Footer";
import { UnderTheHood } from "./UnderTheHood";

/** Section ids double as the programme's anchors; the hero's "Programme ↓" link lands on the first one. */
export const PROGRAMME = [
  { id: "how", label: "How it works" },
  { id: "why", label: "Why identity-bound" },
  { id: "organisers", label: "For organisers" },
  { id: "hood", label: "Under the hood" },
  { id: "faq", label: "FAQ" },
] as const;

/**
 * The landing's below-the-fold programme: the same route and the same world, with the city dimmed behind
 * a run of editorial sections. Plain DOM, so it reads the same with or without WebGL.
 */
export function SiteSections({ config }: { config: AppConfig | undefined }) {
  return (
    <div className="site shrink-0" id="programme" data-testid="site">
      <nav aria-label="Programme" className="site-inner pt-12 sm:pt-16">
        <ul className="mono flex flex-wrap gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-muted">
          {PROGRAMME.map((item, i) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="hover:text-paper">
                <span className="text-amber/80">0{i + 1}</span> {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="how" index={1} kicker="How it works" title="Three frames, one passkey.">
        <ol className="grid gap-6 md:grid-cols-3">
          {FRAMES.map((frame) => (
            <li key={frame.numeral} className="flex flex-col gap-3">
              <figure className="still">
                <img
                  src={frame.still.src}
                  alt={frame.still.alt}
                  width={960}
                  height={600}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption className="mono absolute left-3 top-3 text-[11px] text-amber">
                  {frame.numeral}
                </figcaption>
              </figure>
              <h3 className="display text-2xl">{frame.title}</h3>
              <p className="text-sm text-paper/75">{frame.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="why"
        index={2}
        kicker="Why identity-bound"
        title="A ticket that is also the proof it is yours."
      >
        <ul className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {WHY.map((point) => (
            <li key={point.title}>
              <h3 className="display text-2xl">{point.title}</h3>
              <p className="mt-2 text-sm text-paper/75">{point.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="organisers" index={3} kicker="For organisers" title="Host a night in five decisions.">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <ol className="flex flex-col gap-3">
            {ORGANISER_POINTS.map((line, i) => (
              <li key={line} className="flex gap-4 text-sm text-paper/80">
                <span className="mono w-6 shrink-0 text-amber">0{i + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
          <Link to="/organise" className="btn btn-primary self-start md:self-end" data-testid="site-organise">
            Host your own night →
          </Link>
        </div>
      </Section>

      <Section id="hood" index={4} kicker="Under the hood" title="What the demo is actually running on.">
        <UnderTheHood config={config} />
      </Section>

      <Section id="faq" index={5} kicker="FAQ" title="House rules.">
        <div className="faq divide-y divide-line border-y border-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base sm:text-lg">
                <span>{item.q}</span>
                <span className="mono text-muted transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm text-paper/75">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Footer config={config} />
    </div>
  );
}

function Section({
  id,
  index,
  kicker,
  title,
  children,
}: {
  id: string;
  index: number;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="site-inner scroll-mt-16 py-14 sm:py-20">
      <div className="mb-8 flex items-baseline gap-4 sm:mb-10">
        <span className="mono text-[11px] text-amber/80">0{index}</span>
        <div>
          <Kicker>{kicker}</Kicker>
          <h2 id={`${id}-title`} className="display mt-2 text-4xl sm:text-5xl">
            {title}
          </h2>
        </div>
      </div>
      {children}
    </section>
  );
}
