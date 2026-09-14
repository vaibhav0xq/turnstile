import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BEACON_SLOTS,
  buildCity,
  inPlaza,
  PITCH,
  plazaFrame,
  plazaRect,
  plazaToWorld,
} from "../src/scene/city-gen.ts";

test("every beacon stands on a street intersection; its plaza is the blocks around it plus a forecourt", () => {
  for (const [x, z] of BEACON_SLOTS) {
    assert.equal(Math.abs(x % PITCH), 0, `slot x ${x}`);
    assert.equal(Math.abs(z % PITCH), 0, `slot z ${z}`);
  }
  // the first beacon faces west, away from downtown: the forecourt is the block column west of the square
  assert.deepEqual(plazaFrame([-40, -20]).forward, [-1, 0]);
  assert.deepEqual(plazaRect([-40, -20]), { min: [-77, -37], max: [-23, -3] });
  assert.ok(inPlaza(-30, -10, BEACON_SLOTS));
  assert.ok(inPlaza(-70, -30, BEACON_SLOTS), "the forecourt");
  assert.ok(!inPlaza(-10, -10, BEACON_SLOTS));
  assert.ok(!inPlaza(-90, -10, BEACON_SLOTS));
});

test("plaza-local metres map to the world: +z leads out through the doors, +x runs along the gate line", () => {
  // west-facing: out through the doors is world -x; local +x is forward turned a quarter clockwise, world +z
  assert.deepEqual(plazaToWorld([-40, -20], [0, 1.7, 10]), [-50, 1.7, -20]);
  assert.deepEqual(plazaToWorld([-40, -20], [5, 0, 0]), [-40, 0, -15]);
  // east-facing: mirrored
  assert.deepEqual(plazaToWorld([40, 20], [0, 0, 10]), [50, 0, 20]);
  // south-facing (a beacon further down z than out along x)
  assert.deepEqual(plazaFrame([-20, 60]).forward, [0, 1]);
  assert.deepEqual(plazaToWorld([-20, 60], [3, 0, 10]), [-17, 0, 70]);
});

test("no mass stands inside a plaza", () => {
  const { buildings } = buildCity(BEACON_SLOTS);
  assert.ok(buildings.length > 500, `only ${buildings.length} masses`);
  for (const b of buildings) {
    for (const slot of BEACON_SLOTS) {
      const { min, max } = plazaRect(slot);
      const clearX = b.x + b.w / 2 <= min[0] || b.x - b.w / 2 >= max[0];
      const clearZ = b.z + b.d / 2 <= min[1] || b.z - b.d / 2 >= max[1];
      assert.ok(clearX || clearZ, `mass at ${b.x.toFixed(1)},${b.z.toFixed(1)} sits in the plaza at ${slot}`);
    }
  }
});

test("the buildings are the same city at every detail level; only the point mass thins", () => {
  const high = buildCity(BEACON_SLOTS, 1);
  const low = buildCity(BEACON_SLOTS, 0.5);
  assert.deepEqual(low.buildings, high.buildings);
  assert.deepEqual(low.skyline, high.skyline);
  assert.ok(low.positions.length < high.positions.length);
});

test("set-back tiers and roof plant sit on their building and share its seed", () => {
  const { buildings } = buildCity(BEACON_SLOTS);
  const raised = buildings.filter((b) => b.y0 > 0);
  assert.ok(raised.length > 50, `only ${raised.length} raised masses`);
  for (const r of raised) {
    const under = buildings.find(
      (b) =>
        b !== r &&
        b.seed === r.seed &&
        b.y0 === 0 &&
        Math.abs(b.x - r.x) <= b.w / 2 + 1e-9 &&
        Math.abs(b.z - r.z) <= b.d / 2 + 1e-9,
    );
    assert.ok(under, `raised mass at ${r.x.toFixed(1)},${r.z.toFixed(1)} has nothing under it`);
  }
});
