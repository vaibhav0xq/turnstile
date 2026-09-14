import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeXml, renderTicketSvg, requestOrigin } from "../src/ticket-image.ts";

const base = {
  eventName: "Neon Night at Metropolis",
  tierName: "General Admission",
  seatId: 3,
  seatIndex: 2,
  seatCount: 300,
  startsAt: 1_763_000_000, // Thu, 13 Nov 2025 02:13:20 UTC
  checkedIn: false,
  chainName: "Monad Testnet",
  eventAddress: "0x79a3e41Cbb8acd8c9A1A61a929bdBa302d3121B5",
};

describe("ticket image", () => {
  it("is a self-contained SVG with the event, tier, seat and date on it", () => {
    const svg = renderTicketSvg(base);
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(svg.endsWith("</svg>"));
    assert.match(svg, /Neon Night at/);
    assert.match(svg, /General Admission/);
    assert.match(svg, />#3</);
    assert.match(svg, /13 Nov 2025 · 02:13 UTC/);
    assert.match(svg, /TURNSTILE · MONAD TESTNET/);
    assert.match(svg, /0x79a3…21B5 · 3 of 300</);
    assert.doesNotMatch(svg, /<script|href=|url\(http|@import/i);
    assert.equal(renderTicketSvg(base), svg, "deterministic");
  });

  it("lights the seat green once checked in, amber before", () => {
    const outside = renderTicketSvg(base);
    const inside = renderTicketSvg({ ...base, checkedIn: true });
    assert.match(outside, /BOUND TO THE HOLDER'S PASSKEY/);
    assert.match(outside, /r="34" fill="#ffb457" opacity="0.18"/);
    assert.match(inside, /INSIDE · CHECKED IN ON CHAIN/);
    assert.match(inside, /r="34" fill="#59f2a1" opacity="0.18"/);
    assert.doesNotMatch(inside, /r="34" fill="#ffb457"/);
  });

  it("marks exactly one seat as this ticket's, at its place in the tier", () => {
    const mine = (svg: string) => (svg.match(/r="34" fill/g) ?? []).length;
    assert.equal(mine(renderTicketSvg(base)), 1);
    assert.equal(mine(renderTicketSvg({ ...base, seatIndex: 299 })), 1);
    assert.equal(mine(renderTicketSvg({ ...base, seatIndex: 0, seatCount: 1 })), 1);
    assert.equal(mine(renderTicketSvg({ ...base, seatIndex: 5000, seatCount: 12 })), 1, "clamped");
    assert.notEqual(renderTicketSvg(base), renderTicketSvg({ ...base, seatIndex: 40 }));
  });

  it("escapes organiser-controlled text and clips runaway titles", () => {
    const svg = renderTicketSvg({
      ...base,
      eventName: `<script>alert("x")</script> & Friends' Night`,
      tierName: "VIP <b>Booth</b>",
    });
    assert.doesNotMatch(svg, /<script>/);
    assert.match(svg, /&lt;script&gt;alert\(&quot;x&quot;\)/);
    assert.match(svg, /&amp; Friends&apos;/);
    assert.match(svg, /VIP &lt;b&gt;Booth&lt;\/b&gt;/);
    const long = renderTicketSvg({ ...base, eventName: "Word ".repeat(60) });
    const lines = long.match(/<tspan/g) ?? [];
    assert.ok(lines.length <= 3, `title wrapped to ${lines.length} lines`);
    assert.match(long, /…<\/tspan><\/text>/);
    assert.ok(long.length < 40_000);
  });

  it("escapes every XML special character and strips control characters", () => {
    assert.equal(escapeXml(`a<b>&"c"\u0007'd'`), "a&lt;b&gt;&amp;&quot;c&quot;&apos;d&apos;");
  });

  it("builds the public origin from config, else Host + a literal http(s) forwarded scheme", () => {
    const url = "http://127.0.0.1:8787/api/events/1/tickets/3";
    assert.equal(requestOrigin(new Headers(), url, "https://tickets.example"), "https://tickets.example");
    assert.equal(
      requestOrigin(
        new Headers({ host: "turnstile.example:8443", "x-forwarded-proto": "https, http" }),
        url,
        null,
      ),
      "https://turnstile.example:8443",
    );
    assert.equal(requestOrigin(new Headers(), url, null), "http://127.0.0.1:8787");
  });

  it("never reflects x-forwarded-host, odd schemes or malformed hosts into metadata", () => {
    const url = "http://127.0.0.1:8787/api/events/1/tickets/3";
    assert.equal(
      requestOrigin(
        new Headers({
          host: "turnstile.example",
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "https",
        }),
        url,
        null,
      ),
      "https://turnstile.example",
    );
    assert.equal(
      requestOrigin(new Headers({ host: "turnstile.example", "x-forwarded-proto": "javascript" }), url, null),
      "http://turnstile.example",
    );
    assert.equal(
      requestOrigin(new Headers({ host: "evil.example/@turnstile.example" }), url, null),
      "http://127.0.0.1:8787",
    );
    assert.equal(
      requestOrigin(
        new Headers({ host: "turnstile.example", "x-forwarded-proto": "https" }),
        url,
        "https://cfg.example",
      ),
      "https://cfg.example",
    );
  });
});
