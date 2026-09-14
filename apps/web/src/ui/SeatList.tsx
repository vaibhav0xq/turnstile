import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { type EventInfo, type TierInfo, tierPrice } from "../chain/config";
import type { SeatMap } from "../chain/seats";
import { formatMon } from "../lib/format";
import { useDirector } from "../scene/director";
import { type SeatSpec, type SectionSpec, seatLabel, type VenueLayout } from "../venues/layout";
import { Kicker, Panel } from "./primitives";
import { describeSeat, SeatActions } from "./SeatCard";

interface SeatListProps {
  event: EventInfo;
  layout: VenueLayout;
  seatMap: SeatMap | undefined;
  onClose: () => void;
}

/**
 * Every seat as a button, tier by tier, row by row: the room for a keyboard, a screen reader, or a machine
 * with no WebGL. Selecting here selects in the scene too (same director), so the two never disagree.
 */
export function SeatList({ event, layout, seatMap, onClose }: SeatListProps) {
  const selected = useDirector((s) => s.selectedSeat);
  const selectSeat = useDirector((s) => s.selectSeat);
  const flat = useDirector((s) => s.flat);
  const mine = useDirector((s) => s.mine);
  const panel = useRef<HTMLElement>(null);
  const rows = useMemo(() => groupRows(layout, event.tiers), [layout, event.tiers]);
  const selectedSpec = selected != null ? layout.byId.get(selected) : undefined;
  // Until the seat map arrives nothing is known to be free, so no cell may offer a purchase.
  const loading = seatMap === undefined;

  // Opening the list moves focus in; the caller returns it to the toggle on close.
  useEffect(() => {
    const first =
      panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ??
      panel.current?.querySelector<HTMLButtonElement>(".seat-cell");
    first?.focus({ preventScroll: true });
  }, []);

  return (
    <Panel className="seat-list p-4">
      <section
        ref={panel}
        aria-label="Seat list"
        data-testid="seat-list"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <Kicker>{loading ? "Seat list · loading seats…" : "Seat list"}</Kicker>
          <button type="button" className="chip !min-h-7 text-[11px]" onClick={onClose}>
            Close
          </button>
        </div>
        {rows.map(({ section, tier, rows: sectionRows }) => (
          <div key={`${section.tier}-${section.name}`} className="mt-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm">{section.name}</div>
              <div className="mono text-xs text-muted">{tier ? formatMon(tierPrice(tier)) : ""}</div>
            </div>
            <div
              className="mt-1.5"
              style={{ "--cols": Math.max(...sectionRows.map(([, seats]) => seats.length)) } as CSSProperties}
            >
              {sectionRows.map(([row, seats]) => (
                <div key={row} className="seat-row">
                  <div className="mono pt-0.5 text-[11px] text-muted">Row {row}</div>
                  <fieldset className="seat-cells" aria-label={`Row ${row}`}>
                    {seats.map((seat) => {
                      const described = describeSeat(event, seat, seatMap, mine.has(seat.id));
                      const tone = loading ? "muted" : described.tone;
                      const line = loading ? "loading" : described.line;
                      const isSelected = selected === seat.id;
                      return (
                        <button
                          key={seat.id}
                          type="button"
                          className="seat-cell"
                          data-tone={tone}
                          disabled={loading}
                          aria-pressed={isSelected}
                          aria-label={`${seatLabel(seat)} · ${line}`}
                          title={`${seatLabel(seat)} · ${line}`}
                          onClick={() => selectSeat(isSelected ? null : seat.id)}
                        />
                      );
                    })}
                  </fieldset>
                </div>
              ))}
            </div>
            {!loading &&
            selectedSpec &&
            selectedSpec.tier === section.tier &&
            selectedSpec.section === section.name ? (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">{seatLabel(selectedSpec)}</div>
                  <div className="mono text-xs text-muted">
                    {describeSeat(event, selectedSpec, seatMap, mine.has(selectedSpec.id)).line}
                  </div>
                </div>
                <div className="mt-2">
                  <SeatActions
                    event={event}
                    seat={selectedSpec}
                    seatMap={seatMap}
                    spatial={!flat}
                    tourTarget={flat}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </section>
    </Panel>
  );
}

interface SectionRows {
  section: SectionSpec;
  tier: TierInfo | undefined;
  rows: Array<[string, SeatSpec[]]>;
}

function groupRows(layout: VenueLayout, tiers: TierInfo[]): SectionRows[] {
  return layout.sections.map((section) => {
    const byRow = new Map<string, SeatSpec[]>();
    for (const id of section.seatIds) {
      const seat = layout.byId.get(id);
      if (!seat) continue;
      const list = byRow.get(seat.row) ?? [];
      list.push(seat);
      byRow.set(seat.row, list);
    }
    for (const list of byRow.values()) list.sort((a, b) => a.number - b.number);
    return { section, tier: tiers.find((t) => t.index === section.tier), rows: [...byRow.entries()] };
  });
}
