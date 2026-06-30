import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Fact, TimeBox } from "../../src/domain/index.js";
import { SearchResultSet } from "../../src/search/index.js";
import { AppMode, AppState, PlanPreview } from "../../src/state/index.js";
import {
  BodyRenderer,
  CalendarRenderer,
  HeaderRenderer,
  PromptRenderer,
  TerminalApp
} from "../../src/terminal/index.js";

describe("terminal renderers", () => {
  it("renders header state", () => {
    const state = new AppState({ currentSession: "Steve" });
    const resultSet = new SearchResultSet([buildFact()]);

    assert.equal(
      new HeaderRenderer().render({ state, resultSet, today: "2026-06-30" }),
      "sessions/2026-06-30/Steve"
    );
  });

  it("renders fact rows in the body", () => {
    const state = new AppState({ currentSession: "Steve" });
    const resultSet = new SearchResultSet([buildFact()]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10 }).join("\n"),
      " 1. todo Follow up with Steve. due:2026-07-01"
    );
  });

  it("renders calendar rows and plan previews in plan mode", () => {
    const state = new AppState({
      currentSession: "Steve",
      currentMode: AppMode.PLAN,
      planPreview: PlanPreview.valid(buildTimeBox("preview", "11:00", "12:00", "Counterfact"))
    });
    const renderer = new CalendarRenderer();

    assert.equal(
      renderer.render({
        timeBoxes: [buildTimeBox("actual", "09:00", "10:00", "Steve")],
        planPreview: state.planPreview
      }).join("\n"),
      "09:00-10:00 Steve\n? 11:00-12:00 Counterfact"
    );
  });

  it("renders prompt prefixes", () => {
    const state = new AppState({ currentMode: AppMode.SEARCH });

    assert.equal(new PromptRenderer().render({ state, input: "Steve" }), "> Steve");
  });

  it("composes the terminal app render", () => {
    const state = new AppState({ currentSession: "Steve" });
    const app = new TerminalApp({ state });

    assert.equal(app.render({
      resultSet: new SearchResultSet([buildFact()]),
      width: 40,
      height: 6,
      today: "2026-06-30"
    }), [
      "sessions/2026-06-30/Steve",
      "----------------------------------------",
      " 1. todo Follow up with Steve.",
      "    due:2026-07-01",
      ">"
    ].join("\n"));
  });
});

function buildFact() {
  return new Fact({
    id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
    content: "Follow up with Steve.",
    type: "todo",
    createdAt: "2026-06-30T15:45:00.000Z",
    dueDate: "2026-07-01",
    homeSession: "Steve"
  });
}

function buildTimeBox(id, startsAt, endsAt, session) {
  return new TimeBox({
    id,
    date: "2026-06-30",
    startsAt,
    endsAt,
    session
  });
}
