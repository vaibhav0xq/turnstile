import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { DESCENT_MS, DIVE_MS, pinnedQuality, useDirector } from "../src/scene/director.ts";

const CLUB = "0xa83d5293e0904e17E5058fEF7EFC41dC4beD159D";

/** The city, on screen and settled: the state a dive may leave from. */
function cityOnScreen() {
  useDirector.setState({
    chapter: "city",
    eventAddress: null,
    ready: true,
    flat: false,
    curtain: false,
    flash: false,
    transition: null,
    revealStartedAt: performance.now() - 5000,
  });
}

// One mocked clock for the whole file: resetting it between tests would hand the director's pending
// handles to a new id space, where cancelling them cancels the next test's timers instead.
mock.timers.enable({ apis: ["setTimeout"] });

beforeEach(() => {
  useDirector.getState().goFlat(); // cancels whatever the previous test left pending
  cityOnScreen();
});

test("leaving the city for a room dives, swaps at the bottom, then descends", () => {
  useDirector.getState().showVenue(CLUB);
  let s = useDirector.getState();
  assert.equal(s.chapter, "city");
  assert.equal(s.transition?.kind, "dive");
  assert.equal(s.curtain, false);
  mock.timers.tick(DIVE_MS - 240);
  assert.equal(useDirector.getState().flash, true);
  mock.timers.tick(240);
  s = useDirector.getState();
  assert.equal(s.chapter, "venue");
  assert.equal(s.eventAddress, CLUB);
  assert.equal(s.transition?.kind, "descent");
  mock.timers.tick(60);
  assert.equal(useDirector.getState().flash, false);
  useDirector.getState().endTransition();
  assert.equal(useDirector.getState().transition, null);
});

test("the descent frees the camera on its own if the rig never lands it", () => {
  useDirector.getState().showVenue(CLUB);
  mock.timers.tick(DIVE_MS + DESCENT_MS + 400);
  assert.equal(useDirector.getState().chapter, "venue");
  assert.equal(useDirector.getState().transition, null);
});

test("asking for the same room twice during the dive does not restart it", () => {
  useDirector.getState().showVenue(CLUB);
  const first = useDirector.getState().transition;
  mock.timers.tick(100);
  useDirector.getState().showVenue(CLUB.toLowerCase());
  assert.equal(useDirector.getState().transition, first);
});

test("navigating back to the city mid-dive cancels the dive and its swap", () => {
  useDirector.getState().showVenue(CLUB);
  mock.timers.tick(200);
  useDirector.getState().showCity();
  let s = useDirector.getState();
  assert.equal(s.chapter, "city");
  assert.equal(s.transition, null);
  assert.equal(s.flash, false);
  mock.timers.tick(DIVE_MS + DESCENT_MS + 1000);
  s = useDirector.getState();
  assert.equal(s.chapter, "city");
  assert.equal(s.eventAddress, null);
  assert.equal(s.flash, false);
});

test("a different room requested mid-dive redirects the dive", () => {
  const other = "0x9c4b7a654680b5a4d382b22bdAA10FB05DC23029";
  useDirector.getState().showVenue(CLUB);
  mock.timers.tick(300);
  useDirector.getState().showVenue(other);
  const t = useDirector.getState().transition;
  assert.equal(t?.kind, "dive");
  assert.equal(t?.kind === "dive" && t.eventAddress, other);
  mock.timers.tick(DIVE_MS);
  assert.equal(useDirector.getState().eventAddress, other);
  mock.timers.tick(DIVE_MS);
  assert.equal(useDirector.getState().eventAddress, other);
});

test("losing WebGL mid-dive drops the transition with the scene", () => {
  useDirector.getState().showVenue(CLUB);
  mock.timers.tick(200);
  useDirector.getState().goFlat();
  const s = useDirector.getState();
  assert.equal(s.flat, true);
  assert.equal(s.transition, null);
  mock.timers.tick(DIVE_MS + 100);
  assert.equal(useDirector.getState().chapter, "city");
});

test("a room loaded directly, or before the city has settled, cuts instead of diving", () => {
  useDirector.setState({ revealStartedAt: performance.now() });
  useDirector.getState().showVenue(CLUB);
  let s = useDirector.getState();
  assert.equal(s.transition, null);
  assert.equal(s.curtain, true);
  mock.timers.tick(520);
  s = useDirector.getState();
  assert.equal(s.chapter, "venue");
  assert.equal(s.curtain, false);
});

test("the door and the way back to the city are curtain cuts, and returning early cancels one", () => {
  useDirector.setState({ chapter: "venue", eventAddress: CLUB });
  useDirector.getState().showGate(CLUB);
  assert.equal(useDirector.getState().curtain, true);
  assert.equal(useDirector.getState().transition, null);
  // back to the room before the cut lands: the room stays, the curtain lifts, nothing swaps later
  mock.timers.tick(200);
  useDirector.getState().showVenue(CLUB);
  assert.equal(useDirector.getState().curtain, false);
  mock.timers.tick(1000);
  assert.equal(useDirector.getState().chapter, "venue");

  useDirector.getState().showCity();
  assert.equal(useDirector.getState().transition, null);
  assert.equal(useDirector.getState().curtain, true);
  mock.timers.tick(520);
  assert.equal(useDirector.getState().chapter, "city");
});

test("?tier pins a known tier and ignores anything else", () => {
  assert.equal(pinnedQuality("?tier=high"), "high");
  assert.equal(pinnedQuality("?dev=1&tier=min"), "min");
  assert.equal(pinnedQuality("?tier=ultra"), null);
  assert.equal(pinnedQuality(""), null);
});
