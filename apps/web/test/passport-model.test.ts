import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyPassport,
  NOTE_MAX,
  noteKey,
  parsePassport,
  samePassport,
  withName,
  withNote,
} from "../src/app/passport-model.ts";

describe("passport model", () => {
  it("keys notes by chain, event and seat, never by holder", () => {
    assert.equal(
      noteKey(10143, "0xABCDEF0000000000000000000000000000000001", 2001),
      "10143:0xabcdef0000000000000000000000000000000001:2001",
    );
  });

  it("sets, replaces and removes notes immutably", () => {
    const p0 = emptyPassport();
    const p1 = withNote(p0, "k", "first night ", 100);
    assert.deepEqual(p1.notes, { k: { text: "first night ", at: 100 } }, "raw text while editing");
    assert.deepEqual(p0.notes, {}, "original untouched");
    const p2 = withNote(p1, "k", "first night ", 200);
    assert.equal(p2.notes["k"]?.at, 100, "same text keeps its timestamp");
    const p3 = withNote(p2, "k", "   ", 300);
    assert.deepEqual(p3.notes, {}, "blank removes");
    assert.equal(withNote(p0, "k", "x".repeat(NOTE_MAX + 50), 1).notes["k"]?.text.length, NOTE_MAX);
    assert.equal(withName(p0, "Vee ").name, "Vee ");
    assert.equal(parsePassport(withName(p0, "  Vee  ")).name, "Vee", "trimmed when saved/loaded");
  });

  it("parses leniently: unknown fields dropped, malformed notes skipped, lengths capped", () => {
    const parsed = parsePassport({
      v: 1,
      name: 42,
      notes: { a: { text: "ok", at: 5 }, b: { text: "" }, c: "nope", d: { text: "no time" } },
      extra: true,
    });
    assert.deepEqual(parsed, {
      v: 1,
      name: "",
      notes: { a: { text: "ok", at: 5 }, d: { text: "no time", at: 0 } },
    });
    assert.deepEqual(parsePassport(null), emptyPassport());
    assert.deepEqual(parsePassport("junk"), emptyPassport());
  });

  it("compares by name and note text only", () => {
    const a = withNote(withName(emptyPassport(), "V"), "k", "hi", 1);
    const b = withNote(withName(emptyPassport(), "V "), "k", "hi ", 2);
    assert.equal(samePassport(a, b), true, "whitespace and timestamps do not count");
    assert.equal(samePassport(a, withName(b, "W")), false);
    assert.equal(samePassport(a, withNote(b, "j", "more", 3)), false);
  });
});
