import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CITY_POSE,
  damp,
  FLIGHT_FLOOR,
  FLIGHT_KEYS,
  type FlightSample,
  flightProgress,
  PORTRAIT_KEYS,
  sampleFlight,
} from "../src/scene/flight.ts";

const blank = (): FlightSample => ({ position: [0, 0, 0], target: [0, 0, 0], fov: 0 });
const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));

test("the flight starts on the hero key and lands exactly on the city pose", () => {
  for (const keys of [FLIGHT_KEYS, PORTRAIT_KEYS]) {
    const first = sampleFlight(keys, 0, blank());
    assert.deepEqual(first.position, [...(keys[0] as (typeof keys)[number]).p]);
    assert.deepEqual(first.target, [...(keys[0] as (typeof keys)[number]).t]);
    const last = sampleFlight(keys, keys.length - 1, blank());
    assert.deepEqual(last.position, [...CITY_POSE.p]);
    assert.deepEqual(last.target, [...CITY_POSE.t]);
    assert.equal(last.fov, CITY_POSE.fov);
    // out-of-range progress clamps to the ends instead of extrapolating off the path
    assert.deepEqual(sampleFlight(keys, -3, blank()).position, first.position);
    assert.deepEqual(sampleFlight(keys, 99, blank()).position, last.position);
  }
});

test("the path passes through every key and never dips under the roofs", () => {
  for (const keys of [FLIGHT_KEYS, PORTRAIT_KEYS]) {
    keys.forEach((k, i) => {
      const s = sampleFlight(keys, i, blank());
      assert.ok(dist(s.position, k.p) < 1e-6, `key ${i} position`);
      assert.ok(dist(s.target, k.t) < 1e-6, `key ${i} target`);
      assert.equal(s.fov, k.fov);
      assert.ok(k.p[1] >= FLIGHT_FLOOR, `key ${i} flies at ${k.p[1]}`);
    });
    for (let u = 0; u <= keys.length - 1; u += 0.01) {
      const s = sampleFlight(keys, u, blank());
      assert.ok(s.position[1] >= FLIGHT_FLOOR - 1, `dipped to ${s.position[1]} at u=${u.toFixed(2)}`);
    }
  }
});

test("sampling is continuous: no jump larger than a few units between fine steps", () => {
  for (const keys of [FLIGHT_KEYS, PORTRAIT_KEYS]) {
    let prev = sampleFlight(keys, 0, blank());
    let longest = 0;
    for (let u = 0.005; u <= keys.length - 1 + 1e-9; u += 0.005) {
      const s = sampleFlight(keys, u, blank());
      longest = Math.max(longest, dist(prev.position, s.position), dist(prev.target, s.target));
      assert.ok(Math.abs(s.fov - prev.fov) < 1, "fov step");
      prev = s;
    }
    // 0.005 key units of a ~300-unit segment: a smooth curve moves well under 4 units per step
    assert.ok(longest < 4, `longest step ${longest.toFixed(2)}`);
  }
});

test("portrait keys back off from the same targets with a wider lens", () => {
  PORTRAIT_KEYS.forEach((k, i) => {
    const l = FLIGHT_KEYS[i] as (typeof FLIGHT_KEYS)[number];
    assert.deepEqual(k.t, l.t);
    if (i === PORTRAIT_KEYS.length - 1) {
      assert.deepEqual(k, CITY_POSE);
      return;
    }
    assert.ok(dist(k.p, k.t) > dist(l.p, l.t), `key ${i} is further out`);
    assert.equal(k.fov, 48);
  });
});

test("scroll offsets map linearly onto key units and hold past the last section", () => {
  const tops = [0, 900, 1710, 2520, 3330];
  assert.equal(flightProgress(-50, tops), 0);
  assert.equal(flightProgress(0, tops), 0);
  assert.equal(flightProgress(450, tops), 0.5);
  assert.equal(flightProgress(900, tops), 1);
  assert.ok(Math.abs(flightProgress(2115, tops) - 2.5) < 1e-9);
  assert.equal(flightProgress(3330, tops), 4);
  assert.equal(flightProgress(9000, tops), 4);
  // degenerate layouts never divide by zero
  assert.equal(flightProgress(10, [0, 0, 100]), 1.1);
  assert.equal(flightProgress(10, []), 0);
  assert.equal(flightProgress(10, [0]), 0);
});

test("damping approaches the target without overshoot and is frame-rate independent", () => {
  let a = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1, 6, 1 / 60);
  let b = 0;
  for (let i = 0; i < 30; i++) b = damp(b, 1, 6, 1 / 30);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(a > 0.99 && a < 1);
});
