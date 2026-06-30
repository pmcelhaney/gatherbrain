import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TimeBox } from "../../src/domain/index.js";
import { PlanPreview } from "../../src/state/index.js";

describe("PlanPreview", () => {
  it("commits a valid preview to a time box", () => {
    const timeBox = new TimeBox({
      id: "plan-1",
      date: "2026-06-30",
      session: "Steve",
      startsAt: "09:00",
      endsAt: "10:00"
    });
    const preview = PlanPreview.valid(timeBox, "; 9-10 Steve");

    assert.equal(preview.isValid(), true);
    assert.equal(preview.commit(), timeBox);
  });

  it("reports invalid previews without committing", () => {
    const preview = PlanPreview.invalid("; 10-9 Steve", "End must be after start");

    assert.equal(preview.isValid(), false);
    assert.throws(() => preview.commit(), /End must be after start/);
  });
});
