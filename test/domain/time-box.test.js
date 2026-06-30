import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TimeBox } from "../../src/domain/index.js";

describe("TimeBox", () => {
  it("keeps an explicit date with local start and end times", () => {
    const timeBox = new TimeBox({
      id: "20260630-0900-steve",
      date: "2026-06-30",
      startsAt: "9:00",
      endsAt: "10:00",
      session: "Steve"
    });

    assert.equal(timeBox.date, "2026-06-30");
    assert.equal(timeBox.startsAt, "09:00");
    assert.equal(timeBox.endsAt, "10:00");
    assert.equal(timeBox.session.name, "Steve");
  });

  it("rejects ranges whose end is not after the start", () => {
    assert.throws(
      () => new TimeBox({
        id: "bad-range",
        date: "2026-06-30",
        startsAt: "10:00",
        endsAt: "10:00",
        session: "Steve"
      }),
      /end time must be after start time/
    );
  });

  it("answers containment with an exclusive end time", () => {
    const timeBox = new TimeBox({
      id: "arb",
      date: "2026-06-30",
      startsAt: "09:00",
      endsAt: "10:00",
      session: "Architecture Review Board"
    });

    assert.equal(timeBox.containsTime("09:00"), true);
    assert.equal(timeBox.containsTime("09:59"), true);
    assert.equal(timeBox.containsTime("10:00"), false);
  });

  it("detects overlaps only on the same date", () => {
    const first = new TimeBox({
      id: "first",
      date: "2026-06-30",
      startsAt: "09:00",
      endsAt: "10:00",
      session: "Steve"
    });

    const overlapping = new TimeBox({
      id: "overlapping",
      date: "2026-06-30",
      startsAt: "09:30",
      endsAt: "10:30",
      session: "Counterfact"
    });

    const differentDate = new TimeBox({
      id: "different-date",
      date: "2026-07-01",
      startsAt: "09:30",
      endsAt: "10:30",
      session: "Counterfact"
    });

    assert.equal(first.overlaps(overlapping), true);
    assert.equal(first.overlaps(differentDate), false);
  });
});
