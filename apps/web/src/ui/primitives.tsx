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

export function Dot({ tone }: { tone: "amber" | "cyan" | "green" | "red" | "muted" }) {
  return <span className={`dot ${tone === "amber" ? "" : `dot-${tone}`}`} />;
}

export function StatusLegend() {
  const items: Array<{ tone: "amber" | "cyan" | "green" | "muted"; label: string; extra?: string }> = [
    { tone: "amber", label: "Available" },
    { tone: "cyan", label: "Yours" },
    { tone: "muted", label: "Taken" },
    { tone: "green", label: "Inside" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2 text-xs text-muted">
          <Dot tone={i.tone} />
          {i.label}
        </span>
      ))}
      <span className="flex items-center gap-2 text-xs text-muted">
        <span className="dot" style={{ background: "#b58cff", boxShadow: "0 0 12px #b58cff" }} />
        Listed
      </span>
    </div>
  );
}
