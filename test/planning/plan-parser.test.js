import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlanParser } from "../../src/planning/index.js";

describe("PlanParser", () => {
  it("parses same-day time boxes", () => {
    const parser = new PlanParser({ today: "2026-06-30" });
    const preview = parser.parse("; 9-10 Steve");

    assert.equal(preview.isValid(), true);
    assert.equal(preview.timeBox.date, "2026-06-30");
    assert.equal(preview.timeBox.startsAt, "09:00");
    assert.equal(preview.timeBox.endsAt, "10:00");
    assert.equal(preview.timeBox.context.name, "Steve");
  });

  it("parses explicit relative dates", () => {
    const parser = new PlanParser({ today: "2026-06-30" });
    const preview = parser.parse("; tomorrow 14:30-15:00 Reading");

    assert.equal(preview.isValid(), true);
    assert.equal(preview.timeBox.date, "2026-07-01");
    assert.equal(preview.timeBox.startsAt, "14:30");
    assert.equal(preview.timeBox.endsAt, "15:00");
    assert.equal(preview.timeBox.context.name, "Reading");
  });

  it("parses natural language date prefixes", () => {
    const parser = new PlanParser({ today: "2026-06-30" });
    const preview = parser.parse("; next Friday 14:30-15:00 Reading");

    assert.equal(preview.isValid(), true);
    assert.equal(preview.timeBox.date, "2026-07-03");
    assert.equal(preview.timeBox.startsAt, "14:30");
    assert.equal(preview.timeBox.endsAt, "15:00");
    assert.equal(preview.timeBox.context.name, "Reading");
  });

  it("returns invalid previews for incomplete input", () => {
    const parser = new PlanParser({ today: "2026-06-30" });
    const preview = parser.parse("; 9-10");

    assert.equal(preview.isValid(), false);
    assert.match(preview.error, /requires a context/);
  });
});
