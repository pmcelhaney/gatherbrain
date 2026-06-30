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
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      " 1. todo Follow up with Steve. due:tomorrow"
    );
  });

  it("renders friendly due labels", () => {
    const state = new AppState({ currentSession: "Steve" });
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });
    const resultSet = new SearchResultSet([
      buildFact({ id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a", dueDate: "2026-06-30" }),
      buildFact({ id: "6f2308de-02e9-45db-8ff0-65ac793f4a24", dueDate: "2026-07-01" }),
      buildFact({ id: "0cb20b8b-4c03-4d09-9a10-0340137db913", dueDate: "2026-07-03" }),
      buildFact({ id: "7dfc1e84-d650-404c-a227-b452615620b0", dueDate: "2026-07-10" })
    ]);

    const rendered = renderer.render({
      state,
      resultSet,
      width: 80,
      height: 10,
      today: "2026-06-30"
    }).join("\n");

    assert.match(rendered, /due:today/);
    assert.match(rendered, /due:tomorrow/);
    assert.match(rendered, /due:Fri/);
    assert.match(rendered, /due:Jul 10/);
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

  it("renders help lines before other body modes", () => {
    const state = new AppState({ currentMode: AppMode.PLAN });
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({ state, helpLines: ["Commands", ":help"], height: 10 }).join("\n"),
      "Commands\n:help"
    );
  });

  it("renders prompt prefixes", () => {
    const state = new AppState({ currentMode: AppMode.SEARCH });

    assert.equal(new PromptRenderer().render({ state, input: "Steve" }), "> Steve");
    assert.equal(
      new PromptRenderer().render({ state, input: "Steve", cursor: 2, showCursor: true }),
      "> St█eve"
    );
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
      "    due:tomorrow",
      "",
      ">"
    ].join("\n"));
  });

  it("renders status above the prompt without changing total height", () => {
    const state = new AppState({ currentSession: "Steve" });
    const app = new TerminalApp({ state });
    const rendered = app.render({
      resultSet: new SearchResultSet([buildFact()]),
      width: 40,
      height: 6,
      today: "2026-06-30",
      status: "captured fact"
    }).split("\n");

    assert.equal(rendered.length, 6);
    assert.equal(rendered.at(-2), "captured fact");
    assert.equal(rendered.at(-1), ">");
  });
});

function buildFact(overrides = {}) {
  return new Fact({
    id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
    content: "Follow up with Steve.",
    type: "todo",
    createdAt: "2026-06-30T15:45:00.000Z",
    dueDate: "2026-07-01",
    homeSession: "Steve",
    ...overrides
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
