import { type RefObject, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTour } from "../../app/tour";
import { useNightsOn } from "../../app/use-nights-on";
import type { AppConfig } from "../../chain/config";
import { chainName } from "../../chain/config";
import { flightProgress, useFlight } from "../../scene/flight";
import { Bill } from "../Bill";
import { Button, Kicker } from "../primitives";
import { FRAMES } from "./copy";

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/**
 * The landing's story: five full-height sections whose scroll drives the camera's night flight over the
 * city (see scene/flight.ts). The hero opens high over the haze, three frames drop to the beacons, and the
 * last section lands on the picker's own pose with tonight's bill — so "Enter the city" is a step, not a
 * cut. Under reduced motion the city holds still and the story simply scrolls over it.
 */
export function Story({
  config,
  overlay,
}: {
  config: AppConfig | undefined;
  overlay: RefObject<HTMLDivElement | null>;
}) {
  const navigate = useNavigate();
  const startTour = useTour((s) => s.start);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const tonight = useRef<HTMLElement>(null);
  const setActive = useFlight((s) => s.setActive);
  const setTarget = useFlight((s) => s.setTarget);

  useEffect(() => {
    const el = overlay.current;
    if (!el) return;
    // the scroll is measured either way (the header's chip and the phone's pill key off it); under reduced
    // motion only the camera stays put
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tops: number[] = [];
    const update = () => setTarget(flightProgress(el.scrollTop, tops));
    const measure = () => {
      // section offsets inside the scroll content: rect deltas, so wrappers and positioning do not matter
      const base = el.getBoundingClientRect().top - el.scrollTop;
      tops = sections.current.map((s) => (s ? s.getBoundingClientRect().top - base : 0));
      update();
    };
    if (!still) setActive(true);
    measure();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const s of sections.current) if (s) ro.observe(s);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      setActive(false);
    };
  }, [overlay, setActive, setTarget]);

  const lit = useNightsOn(config).length;
  const enterCity = () => navigate("/city");
  const watchTour = () => {
    navigate("/city");
    startTour({ autoplay: true });
  };
  const litLine = !config
    ? "Lighting the beacons…"
    : lit === 0
      ? "The city is dark tonight."
      : lit === 1
        ? "One night is lit."
        : `${NUMBER_WORDS[lit] ?? lit} nights are lit.`;

  return (
    <>
      {/* 0 · hero */}
      <section
        ref={(n) => {
          sections.current[0] = n;
        }}
        className="story-hero relative flex min-h-dvh shrink-0 flex-col justify-end px-5 pb-[14dvh] pt-24 sm:justify-center sm:px-8 sm:pb-24"
        aria-labelledby="hero-title"
      >
        <div className="story-copy max-w-2xl">
          <Kicker className="fade-up">Identity-bound tickets · Monad</Kicker>
          <h1
            id="hero-title"
            className="display fade-up mt-4 text-[11.5vw] leading-[0.92] sm:text-6xl md:text-7xl xl:text-[5.5rem]"
          >
            One passkey.
            <br />
            <em className="text-amber">Every door in the city.</em>
          </h1>
          <p className="fade-up-late mt-6 max-w-lg text-base text-paper/80 sm:text-lg">
            It buys the seat and it opens the door. No wallet, no app — the code on your phone is signed by a
            key made for tonight's door alone.
          </p>
          <div className="fade-up-late mt-7 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={enterCity} data-testid="enter-city">
              Enter the city
            </Button>
            <Button variant="ghost" onClick={watchTour} data-testid="tour-watch">
              <span aria-hidden="true" className="text-amber">
                ▶
              </span>
              Watch the tour · 2 min
            </Button>
          </div>
        </div>
        <div className="mono pointer-events-none absolute inset-x-5 bottom-6 flex items-end justify-between text-[11px] uppercase tracking-[0.16em] text-muted sm:inset-x-8">
          <span className="scroll-hint">Scroll to descend ↓</span>
          <span className="hidden text-right sm:block">
            {config ? chainName(config.chainId) : "connecting"} · {lit} {lit === 1 ? "night" : "nights"} lit ·
            free seats sponsored
          </span>
        </div>
      </section>

      {/* I–III · frames */}
      {FRAMES.map((frame, i) => (
        <section
          key={frame.numeral}
          ref={(n) => {
            sections.current[i + 1] = n;
          }}
          className={`story-frame relative flex min-h-[92dvh] shrink-0 flex-col justify-end px-5 py-16 sm:min-h-dvh sm:justify-center sm:px-8 ${i === 1 ? "sm:items-start" : "sm:items-end"}`}
          aria-labelledby={`frame-${frame.numeral}`}
        >
          <div className="story-copy flex w-full max-w-md flex-col gap-4">
            <div>
              <span className="mono text-[11px] text-amber">{frame.numeral}</span>
              <h2 id={`frame-${frame.numeral}`} className="display mt-2 text-3xl sm:text-4xl">
                {frame.title}
              </h2>
              <p className="mt-3 text-sm text-paper/75 sm:text-base">{frame.body}</p>
            </div>
            <figure className="still">
              <img
                src={frame.still.src}
                alt={frame.still.alt}
                width={960}
                height={600}
                loading="lazy"
                decoding="async"
              />
            </figure>
          </div>
        </section>
      ))}

      {/* 4 · tonight: the flight has landed on the picker's pose */}
      <section
        ref={(n) => {
          sections.current[4] = n;
          tonight.current = n;
        }}
        className="story-tonight relative flex min-h-dvh shrink-0 flex-col justify-end gap-8 px-5 py-16 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:pb-20"
        aria-labelledby="tonight-title"
      >
        <div className="story-copy max-w-md">
          <Kicker>Tonight in the city</Kicker>
          <h2 id="tonight-title" className="display mt-3 text-4xl sm:text-5xl" aria-live="polite">
            {litLine}
          </h2>
          <p className="mt-4 text-sm text-paper/75 sm:text-base">
            Pick a night below, or walk in and choose from the city itself — each beacon is a door.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={enterCity}>
              Enter the city
            </Button>
            {/* a plain anchor: the browser scrolls the overlay (the scroll container) to the programme */}
            <a
              href="#programme"
              className="mono text-[11px] uppercase tracking-[0.16em] text-muted hover:text-paper"
            >
              Programme ↓
            </a>
          </div>
        </div>
        <Bill config={config} kicker={null} className="sm:w-80" />
      </section>

      <MobilePill tonight={tonight} overlay={overlay} onEnter={enterCity} />
    </>
  );
}

/**
 * A phone's "Enter the city" that follows the reader once the hero has gone: hidden while the hero is up,
 * while the Tonight section (which has its own button) is in view, and over the footer.
 */
function MobilePill({
  tonight,
  overlay,
  onEnter,
}: {
  tonight: RefObject<HTMLElement | null>;
  overlay: RefObject<HTMLDivElement | null>;
  onEnter: () => void;
}) {
  const scrolled = useFlight((s) => s.scrolled);
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const root = overlay.current;
    const watched = [tonight.current, root?.querySelector("footer") ?? null].filter(
      (n): n is HTMLElement => n != null,
    );
    if (!root || watched.length === 0) return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        setCovered(visible.size > 0);
      },
      { root, threshold: 0.05 },
    );
    for (const n of watched) io.observe(n);
    return () => io.disconnect();
  }, [tonight, overlay]);
  const shown = scrolled && !covered;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-5 z-20 flex justify-center transition-opacity duration-300 sm:hidden ${shown ? "opacity-100" : "opacity-0"}`}
      aria-hidden={!shown}
    >
      <Button
        variant="primary"
        className={shown ? "pointer-events-auto" : ""}
        onClick={onEnter}
        tabIndex={-1}
      >
        Enter the city
      </Button>
    </div>
  );
}
