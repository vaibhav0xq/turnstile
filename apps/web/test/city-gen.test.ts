import assert from "node:assert/strict";
import { test } from "node:test";
import { BEACON_SLOTS, buildCity, inPlaza, PITCH, PLAZA_HALF } from "../src/scene/city-gen.ts";

test("every beacon stands on a street intersection, so its plaza is four whole blocks", () => {
  for (const [x, z] of BEACON_SLOTS) {
    assert.equal(Math.abs(x % PITCH), 0, `slot x ${x}`);
    assert.equal(Math.abs(z % PITCH), 0, `slot z ${z}`);
  }
  assert.ok(inPlaza(-30, -10, BEACON_SLOTS));
  assert.ok(!inPlaza(-10, -10, BEACON_SLOTS));
});

test("no mass stands inside a plaza square", () => {
  const { buildings } = buildCity(BEACON_SLOTS);
  assert.ok(buildings.length > 500, `only ${buildings.length} masses`);
  for (const b of buildings) {
    for (const [px, pz] of BEACON_SLOTS) {
      const clearX = Math.abs(b.x - px) - b.w / 2 >= PLAZA_HALF;
      const clearZ = Math.abs(b.z - pz) - b.d / 2 >= PLAZA_HALF;
      assert.ok(
        clearX || clearZ,
        `mass at ${b.x.toFixed(1)},${b.z.toFixed(1)} sits in the plaza at ${px},${pz}`,
      );
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
