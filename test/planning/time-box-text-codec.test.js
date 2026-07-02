import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TimeBox } from "../../src/domain/index.js";
import { TimeBoxTextCodec } from "../../src/planning/index.js";

describe("TimeBoxTextCodec", () => {
  it("serializes one date of time boxes as text", () => {
    const codec = new TimeBoxTextCodec();
    const text = codec.serialize("2026-06-30", [
      new TimeBox({
        id: "later",
        date: "2026-06-30",
        startsAt: "11:00",
        endsAt: "12:00",
        context: "Counterfact"
      }),
      new TimeBox({
        id: "earlier",
        date: "2026-06-30",
        startsAt: "09:00",
        endsAt: "10:00",
        context: "Steve"
      })
    ]);

    assert.equal(text, "09:00-10:00 | Steve | earlier\n11:00-12:00 | Counterfact | later\n");
  });

  it("parses daily text files", () => {
    const codec = new TimeBoxTextCodec();
    const timeBoxes = codec.parse("2026-06-30", "09:00-10:00 | Steve | earlier\n");

    assert.equal(timeBoxes[0].id, "earlier");
    assert.equal(timeBoxes[0].date, "2026-06-30");
    assert.equal(timeBoxes[0].context.name, "Steve");
  });
});
