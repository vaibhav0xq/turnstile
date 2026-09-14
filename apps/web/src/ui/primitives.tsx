import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "amber";

export function Button({
  variant = "ghost",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button type="button" className={`btn btn-${variant} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Kicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mono text-[11px] uppercase tracking-[0.18em] text-muted ${className}`}>{children}</div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-[20px] ${className}`}>{children}</div>;
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "cyan" | "green" | "amber";
}) {
  const color =
    tone === "cyan" ? "text-cyan" : tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : "";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</span>
      <span className={`mono text-sm ${color}`}>{value}</span>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper ${className}`}
      aria-hidden
    />
  );
}

export function Dot({ tone }: { tone: "amber" | "cyan" | "green" | "red" | "muted" | "violet" }) {
  return <span className={`dot ${tone === "amber" ? "" : `dot-${tone}`}`} />;
}

/** What the seat colours mean. Folded behind one word on phones, where the room needs the height. */
export function StatusLegend() {
  const items: Array<{ tone: "amber" | "cyan" | "green" | "muted" | "violet"; label: string }> = [
    { tone: "amber", label: "Available" },
    { tone: "cyan", label: "Yours" },
    { tone: "muted", label: "Taken" },
    { tone: "green", label: "Inside" },
    { tone: "violet", label: "Listed" },
  ];
  const row = (className: string) => (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2 text-xs text-muted">
          <Dot tone={i.tone} />
          {i.label}
        </span>
      ))}
    </div>
  );
  // A closed <details> withholds everything but its summary whatever CSS the children carry, so the
  // always-open desktop row is its own element and the phone folds a second copy behind one word.
  return (
    <>
      {row("max-sm:hidden")}
      <details className="group sm:hidden">
        <summary className="mono cursor-pointer list-none text-[11px] text-muted hover:text-paper [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Legend ▾</span>
          <span className="hidden group-open:inline">Legend ▴</span>
        </summary>
        {row("mt-1.5")}
      </details>
    </>
  );
}
