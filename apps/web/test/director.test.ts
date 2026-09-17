import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import {
  classifyQuality,
  DESCENT_MS,
  DIVE_MS,
  pinnedQuality,
  useDirector,
  WARM_MAX_MS,
} from "../src/scene/director.ts";

const CLUB = "0xa83d5293e0904e17E5058fEF7EFC41dC4beD159D";

/** The city, on screen and settled: the state a dive may leave from. */
function cityOnScreen() {
  useDirector.setState({
    chapter: "city",
    eventAddress: null,
    ready: true,
    warm: true,
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

test("leaving the city for a room dives, swaps under the flash, and descends once the room is warm", () => {
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
  assert.equal(s.warm, false);
  assert.equal(s.transition?.kind, "descent");
  assert.equal(s.transition?.kind === "descent" && s.transition.held, true);
  // the room is still compiling: the flash stays up and the descent stays parked
  mock.timers.tick(300);
  assert.equal(useDirector.getState().flash, true);
  const before = useDirector.getState().revealStartedAt;
  mock.timers.tick(50);
  useDirector.getState().markWarm();
  s = useDirector.getState();
  assert.equal(s.warm, true);
  assert.equal(s.flash, false);
  assert.equal(s.transition?.kind, "descent");
  assert.equal(s.transition?.kind === "descent" && s.transition.held, undefined);
  assert.ok(s.revealStartedAt >= before);
  useDirector.getState().endTransition();
  assert.equal(useDirector.getState().transition, null);
});

test("a room that never reports warm is revealed after WARM_MAX_MS anyway", () => {
  useDirector.getState().showVenue(CLUB);
  mock.timers.tick(DIVE_MS + WARM_MAX_MS - 1);
  assert.equal(useDirector.getState().flash, true);
  assert.equal(useDirector.getState().warm, false);
  mock.timers.tick(1);
  const s = useDirector.getState();
  assert.equal(s.warm, true);
  assert.equal(s.flash, false);
  assert.equal(s.transition?.kind, "descent");
});

test("the descent frees the camera on its own if the rig never lands it", () => {
  useDirector.getState().showVenue(CLUB);
  mock.timers.tick(DIVE_MS);
  useDirector.getState().markWarm();
  mock.timers.tick(DESCENT_MS + 400);
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

test("navigating away while a room compiles behind the flash cuts on, and the next scene gates again", () => {
  useDirector.getState().showVenue(CLUB);
  mock.timers.tick(DIVE_MS);
  assert.equal(useDirector.getState().warm, false);
  useDirector.getState().showCity();
  let s = useDirector.getState();
  assert.equal(s.flash, false);
  assert.equal(s.curtain, true);
  assert.equal(s.transition, null);
  mock.timers.tick(520);
  s = useDirector.getState();
  assert.equal(s.chapter, "city");
  assert.equal(s.warm, false);
  assert.equal(s.curtain, true);
  useDirector.getState().markWarm();
  assert.equal(useDirector.getState().curtain, false);
  // the room's stale WARM_MAX timer was cancelled with the dive: nothing flips the city later
  mock.timers.tick(WARM_MAX_MS + 100);
  assert.equal(useDirector.getState().chapter, "city");
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
  // swapped behind the curtain; it lifts when the room is warm
  assert.equal(s.curtain, true);
  assert.equal(s.warm, false);
  useDirector.getState().markWarm();
  assert.equal(useDirector.getState().curtain, false);
  assert.equal(useDirector.getState().transition, null);
});

test("asking for the scene that is compiling behind the curtain keeps the curtain up until it is warm", () => {
  useDirector.setState({ chapter: "venue", eventAddress: CLUB });
  useDirector.getState().showGate(CLUB);
  mock.timers.tick(520);
  assert.equal(useDirector.getState().chapter, "gate");
  assert.equal(useDirector.getState().warm, false);
  useDirector.getState().showGate(CLUB);
  assert.equal(useDirector.getState().curtain, true);
  mock.timers.tick(WARM_MAX_MS);
  assert.equal(useDirector.getState().warm, true);
  assert.equal(useDirector.getState().curtain, false);
});

test("a scene that finishes compiling while a cut away from it is pending cannot drop the curtain", () => {
  // the door is still compiling behind the curtain when the fan heads back to the city
  useDirector.setState({ chapter: "gate", eventAddress: CLUB, warm: false, curtain: true });
  useDirector.getState().showCity();
  assert.equal(useDirector.getState().cutting, true);
  mock.timers.tick(200);
  useDirector.getState().markWarm(); // the door's gate reports in: about to be swapped out, ignored
  let s = useDirector.getState();
  assert.equal(s.warm, false);
  assert.equal(s.curtain, true);
  mock.timers.tick(320);
  s = useDirector.getState();
  assert.equal(s.chapter, "city");
  assert.equal(s.cutting, false);
  assert.equal(s.curtain, true);
  useDirector.getState().markWarm(); // the city's own gate
  s = useDirector.getState();
  assert.equal(s.warm, true);
  assert.equal(s.curtain, false);
});

test("cancelling a cut back to a scene still compiling keeps the curtain until that scene is warm", () => {
  useDirector.setState({ chapter: "venue", eventAddress: CLUB, warm: false, curtain: true });
  useDirector.getState().showCity();
  mock.timers.tick(100);
  useDirector.getState().showVenue(CLUB);
  let s = useDirector.getState();
  assert.equal(s.chapter, "venue");
  assert.equal(s.cutting, false);
  assert.equal(s.curtain, true);
  mock.timers.tick(1000); // the cancelled cut's swap never lands
  assert.equal(useDirector.getState().chapter, "venue");
  useDirector.getState().markWarm(); // the room's gate, no longer stale
  s = useDirector.getState();
  assert.equal(s.warm, true);
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
  assert.equal(useDirector.getState().curtain, true);
  useDirector.getState().markWarm();
  assert.equal(useDirector.getState().curtain, false);
});

test("?tier pins a known tier and ignores anything else", () => {
  assert.equal(pinnedQuality("?tier=high"), "high");
  assert.equal(pinnedQuality("?dev=1&tier=min"), "min");
  assert.equal(pinnedQuality("?tier=ultra"), null);
  assert.equal(pinnedQuality(""), null);
});

test("the starting tier follows the device: phones and software GPUs min, tablets and integrated GPUs low", () => {
  const desktop = {
    coarse: false,
    width: 1440,
    cores: 8,
    memory: 16,
    gpu: "ANGLE (NVIDIA GeForce RTX 3060)",
  };
  assert.equal(classifyQuality(desktop), "high");
  assert.equal(classifyQuality({ ...desktop, gpu: "Apple M2" }), "high");
  assert.equal(
    classifyQuality({ ...desktop, gpu: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)" }),
    "low",
  );
  assert.equal(classifyQuality({ ...desktop, gpu: "AMD Radeon(TM) Graphics" }), "low");
  assert.equal(classifyQuality({ ...desktop, cores: 4 }), "low");
  assert.equal(classifyQuality({ ...desktop, memory: 4 }), "low");
  assert.equal(classifyQuality({ ...desktop, gpu: "Google SwiftShader" }), "min");
  assert.equal(classifyQuality({ ...desktop, gpu: "" }), "high");
  assert.equal(
    classifyQuality({ coarse: true, width: 390, cores: 8, memory: 4, gpu: "Adreno (TM) 610" }),
    "min",
  );
  assert.equal(
    classifyQuality({ coarse: true, width: 1024, cores: 8, memory: null, gpu: "Apple GPU" }),
    "low",
  );
});
