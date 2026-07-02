import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatNaturalDate,
  naturalDatePrefix,
  normalizeNaturalDates,
  replaceIsoDatesWithNaturalDates,
  resolveDateExpression
} from "../../src/domain/date-text.js";

describe("date text", () => {
  it("normalizes natural language dates to ISO dates", () => {
    assert.equal(
      normalizeNaturalDates("Follow up tomorrow, next Friday, and June 1.", {
        today: "2026-06-30"
      }),
      "Follow up 2026-07-01, 2026-07-03, and 2026-06-01."
    );
  });

  it("resolves natural language date expressions", () => {
    assert.equal(resolveDateExpression("tomorrow", { today: "2026-06-30" }), "2026-07-01");
    assert.equal(resolveDateExpression("next Friday", { today: "2026-06-30" }), "2026-07-03");
    assert.equal(resolveDateExpression("June 1", { today: "2026-06-30" }), "2026-06-01");
  });

  it("reads natural date prefixes before command arguments", () => {
    assert.deepEqual(
      naturalDatePrefix("next Friday 14:30-15:00 Reading", { today: "2026-06-30" }),
      {
        date: "2026-07-03",
        text: "next Friday",
        rest: "14:30-15:00 Reading"
      }
    );
  });

  it("formats ISO dates as natural language for output", () => {
    assert.equal(formatNaturalDate("2026-07-01", { today: "2026-06-30" }), "tomorrow");
    assert.equal(formatNaturalDate("2026-07-03", { today: "2026-06-30" }), "Fri");
    assert.equal(formatNaturalDate("2026-06-01", { today: "2026-06-30" }), "Jun 1");
    assert.equal(
      replaceIsoDatesWithNaturalDates("Follow up 2026-07-01 and 2026-06-01.", {
        today: "2026-06-30"
      }),
      "Follow up tomorrow and Jun 1."
    );
  });
});
