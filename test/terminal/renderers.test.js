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
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([buildFact()]);

    assert.equal(
      new HeaderRenderer().render({ state, resultSet, today: "2026-06-30" }),
      "contexts/Steve"
    );
  });

  it("renders fact rows in the body", () => {
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([buildFact()]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "+ 1. task tomorrow Follow up with Steve."
    );
  });

  it("hides the default fact type in body rows", () => {
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([
      buildFact({ type: "fact", dueDate: null })
    ]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "+ 1. Follow up with Steve."
    );
  });

  it("renders bookmark content as a terminal hyperlink", () => {
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([
      buildFact({
        content: "Read the Node docs.",
        type: "bookmark",
        dueDate: null,
        url: "https://nodejs.org/api/test.html"
      })
    ]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "+ 1. bookmark \x1b]8;;https://nodejs.org/api/test.html\x1b\\Read the Node docs.\x1b]8;;\x1b\\"
    );
  });

  it("colors tag mentions in fact rows", () => {
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([
      buildFact({
        content: "@Steve Ma said @Devin's trial ends.",
        tags: ["Steve Ma", "Devin"]
      })
    ]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({
        state,
        resultSet,
        width: 80,
        height: 10,
        today: "2026-06-30",
        colorEnabled: true
      }).join("\n"),
      `\x1b[90m+ 1. \x1b[0m\x1b[36mtask \x1b[0m\x1b[35mtomorrow \x1b[0m\x1b[32m@Steve Ma\x1b[0m said \x1b[32m@Devin\x1b[0m's trial ends.`
    );
  });

  it("leaves tag mentions plain when color is disabled", () => {
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([
      buildFact({
        content: "@Steve Ma said @Devin's trial ends.",
        tags: ["Steve Ma", "Devin"]
      })
    ]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "+ 1. task tomorrow @Steve Ma said @Devin's trial ends."
    );
  });

  it("renders unmentioned tags after fact content", () => {
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([
      buildFact({
        content: "Follow up tomorrow.",
        tags: ["Steve Ma"]
      })
    ]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "+ 1. task tomorrow Follow up tomorrow. >Steve Ma"
    );
  });

  it("colors unmentioned tags after fact content", () => {
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([
      buildFact({
        content: "Follow up tomorrow.",
        tags: ["Steve Ma"]
      })
    ]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({
        state,
        resultSet,
        width: 80,
        height: 10,
        today: "2026-06-30",
        colorEnabled: true
      }).join("\n"),
      `\x1b[90m+ 1. \x1b[0m\x1b[36mtask \x1b[0m\x1b[35mtomorrow \x1b[0mFollow up tomorrow. \x1b[32m>Steve Ma\x1b[0m`
    );
  });

  it("does not repeat tags already mentioned in fact content", () => {
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([
      buildFact({
        content: "Follow up with @Steve Ma tomorrow.",
        tags: ["Steve Ma"]
      })
    ]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "+ 1. task tomorrow Follow up with @Steve Ma tomorrow."
    );
  });

  it("renders friendly due labels", () => {
    const state = new AppState({ currentContext: "Steve" });
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });
    const resultSet = new SearchResultSet([
      buildFact({ id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a", dueDate: "2026-06-30" }),
      buildFact({ id: "6f2308de-02e9-45db-8ff0-65ac793f4a24", dueDate: "2026-07-01" }),
      buildFact({ id: "0cb20b8b-4c03-4d09-9a10-0340137db913", dueDate: "2026-07-03" }),
      buildFact({ id: "7dfc1e84-d650-404c-a227-b452615620b0", dueDate: "2026-07-10" }),
      buildFact({ id: "1434dc6f-fad5-47c1-bc7d-54454f7d53cc", dueDate: "2026-06-29" })
    ]);

    const rendered = renderer.render({
      state,
      resultSet,
      width: 80,
      height: 10,
      today: "2026-06-30"
    }).join("\n");

    assert.match(rendered, /today Follow up/);
    assert.match(rendered, /tomorrow Follow up/);
    assert.match(rendered, /Fri Follow up/);
    assert.match(rendered, /Jul 10 Follow up/);
    assert.match(rendered, /yesterday Follow up/);
  });

  it("renders ISO dates in fact content as natural language", () => {
    const state = new AppState({ currentContext: "Steve" });
    const resultSet = new SearchResultSet([
      buildFact({
        content: "Follow up 2026-07-01, 2026-07-03, and 2026-06-01.",
        dueDate: null
      })
    ]);
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "+ 1. task Follow up tomorrow, Fri, and Jun 1."
    );
  });

  it("marks preview-selected fact rows", () => {
    const state = new AppState({ currentContext: "Steve" });
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });
    const selectedFact = buildFact();
    const resultSet = new SearchResultSet([selectedFact]);

    assert.equal(
      renderer.render({
        state,
        resultSet,
        selectionPreview: { includes: (factId) => factId === selectedFact.id },
        width: 80,
        height: 10,
        today: "2026-06-30"
      }).join("\n"),
      ">+ 1. task tomorrow Follow up with Steve."
    );
  });

  it("does not mark facts outside the current context", () => {
    const state = new AppState({ currentContext: "Steve" });
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });
    const resultSet = new SearchResultSet([
      buildFact({ homeContext: "Architecture Review Board" })
    ]);

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "  1. task tomorrow Follow up with Steve."
    );
  });

  it("shows the home context when rendering search results", () => {
    const state = new AppState({
      currentContext: "Steve",
      currentMode: AppMode.SEARCH
    });
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });
    const resultSet = new SearchResultSet([
      buildFact({ homeContext: "Architecture Review Board" })
    ]);

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "  1. task tomorrow [Architecture Review Board] Follow up with Steve."
    );
  });

  it("does not show the home context for current-context search results", () => {
    const state = new AppState({
      currentContext: "Steve",
      currentMode: AppMode.SEARCH
    });
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });
    const resultSet = new SearchResultSet([
      buildFact({ homeContext: "Steve" }),
      buildFact({
        id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
        homeContext: "Architecture Review Board",
        associatedContexts: ["Steve"]
      })
    ]);

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      [
        "+ 1. task tomorrow Follow up with Steve.",
        "+ 2. task tomorrow Follow up with Steve."
      ].join("\n")
    );
  });

  it("marks facts associated with the current context", () => {
    const state = new AppState({ currentContext: "Steve" });
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });
    const resultSet = new SearchResultSet([
      buildFact({
        homeContext: "Architecture Review Board",
        associatedContexts: ["Steve"]
      })
    ]);

    assert.equal(
      renderer.render({ state, resultSet, width: 80, height: 10, today: "2026-06-30" }).join("\n"),
      "+ 1. task tomorrow Follow up with Steve."
    );
  });

  it("uses reverse video for preview selection when color is enabled", () => {
    const state = new AppState({ currentContext: "Steve" });
    const renderer = new BodyRenderer({ calendarRenderer: new CalendarRenderer() });
    const selectedFact = buildFact({
      content: "Follow up with @Steve Ma.",
      tags: ["Steve Ma"]
    });
    const resultSet = new SearchResultSet([selectedFact]);

    const rendered = renderer.render({
      state,
      resultSet,
      selectionPreview: { includes: (factId) => factId === selectedFact.id },
      width: 80,
      height: 10,
      today: "2026-06-30",
      colorEnabled: true
    }).join("\n");

    assert.equal(
      rendered,
      "\x1b[7m\x1b[90m+ 1. \x1b[0m\x1b[7m\x1b[36mtask \x1b[0m\x1b[7m\x1b[35mtomorrow \x1b[0m\x1b[7mFollow up with \x1b[32m@Steve Ma\x1b[0m\x1b[7m.\x1b[0m"
    );
  });

  it("renders calendar rows and plan previews in plan mode", () => {
    const state = new AppState({
      currentContext: "Steve",
      currentMode: AppMode.PLAN,
      planPreview: PlanPreview.valid(buildTimeBox("preview", "11:00", "12:00", "Counterfact"))
    });
    const renderer = new CalendarRenderer();

    const rendered = renderer.render({
      timeBoxes: [buildTimeBox("actual", "09:00", "10:00", "Steve")],
      planPreview: state.planPreview,
      now: new Date(2026, 5, 30, 10, 30),
      height: 21
    });

    assert.equal(rendered[0], " 8:00  ○  free · 1h");
    assert.equal(rendered[2], " 9:00  ●  Steve · 1h");
    assert.equal(rendered[4], "10:00  ○  free · 1h");
    assert.equal(rendered[5], "10:30  ◆  now");
    assert.equal(rendered[6], "11:00  ?  Counterfact · 1h");
    assert.equal(rendered[8], "12:00  ○  free · 6h");
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
      "> St\x1b[7me\x1b[0mve"
    );
    assert.equal(
      new PromptRenderer().render({ state, input: "Steve", cursor: 0, showCursor: true }),
      "> \x1b[7mS\x1b[0mteve"
    );
    assert.equal(
      new PromptRenderer().render({
        state,
        input: "@Stacy",
        cursor: 3,
        showCursor: true,
        completionSuggestionStart: 3,
        colorEnabled: true
      }),
      "> @St█\x1b[90macy\x1b[0m"
    );
  });

  it("composes the terminal app render", () => {
    const state = new AppState({ currentContext: "Steve" });
    const app = new TerminalApp({ state });

    assert.equal(app.render({
      resultSet: new SearchResultSet([buildFact()]),
      width: 40,
      height: 6,
      today: "2026-06-30"
    }), [
      "contexts/Steve",
      "----------------------------------------",
      "+ 1. task tomorrow Follow up with Steve.",
      "",
      "",
      ">"
    ].join("\n"));
  });

  it("renders compact completion candidates above the prompt", () => {
    const state = new AppState({ currentContext: "Steve" });
    const app = new TerminalApp({ state });

    assert.equal(app.render({
      completionCandidates: ["@Stephanie\\ Garoza", "@Stephanie\\ Smith"],
      completionCandidateIndex: 1,
      colorEnabled: true,
      width: 40,
      height: 5
    }), [
      "contexts/Steve",
      "----------------------------------------",
      "...",
      "\x1b[90m@Stephanie\\ Garoza\x1b[0m  \x1b[36m@Stephanie\\ Smith\x1b[0m",
      ">"
    ].join("\n"));
  });

  it("renders status above the prompt without changing total height", () => {
    const state = new AppState({ currentContext: "Steve" });
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
    type: "task",
    createdAt: "2026-06-30T15:45:00.000Z",
    dueDate: "2026-07-01",
    homeContext: "Steve",
    ...overrides
  });
}

function buildTimeBox(id, startsAt, endsAt, context) {
  return new TimeBox({
    id,
    date: "2026-06-30",
    startsAt,
    endsAt,
    context
  });
}
