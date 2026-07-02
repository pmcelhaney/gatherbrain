import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TimeBox } from "../../src/domain/index.js";
import { AppMode, AppState, PlanPreview, Selection } from "../../src/state/index.js";

describe("AppState", () => {
  it("starts without a capture context", () => {
    const state = new AppState();

    assert.equal(state.currentContext, null);
    assert.equal(state.currentQuery, null);
    assert.equal(state.currentMode, AppMode.COMMAND);
    assert.equal(state.canCaptureFact(), false);
    assert.throws(() => state.requireCaptureContext(), /current context is required/);
  });

  it("switches contexts and resets query and selection", () => {
    const state = new AppState({
      currentSelection: new Selection(["a", "b"])
    });

    state.switchContext("Steve");

    assert.equal(state.currentContext.name, "Steve");
    assert.equal(state.currentQuery, "context:Steve");
    assert.equal(state.currentSelection.isEmpty(), true);
    assert.equal(state.currentMode, AppMode.CAPTURE);
  });

  it("clears selection when search changes", () => {
    const state = new AppState({
      currentContext: "Steve",
      currentSelection: new Selection(["a"])
    });

    state.setQuery("type:task");

    assert.equal(state.currentQuery, "type:task");
    assert.equal(state.currentSelection.isEmpty(), true);
    assert.equal(state.currentMode, AppMode.SEARCH);
  });

  it("stores and clears plan previews", () => {
    const state = new AppState({ currentContext: "Steve" });
    const timeBox = new TimeBox({
      id: "plan-1",
      date: "2026-06-30",
      context: "Steve",
      startsAt: "09:00",
      endsAt: "10:00"
    });

    state.setPlanPreview(PlanPreview.valid(timeBox, "; 9-10 Steve"));

    assert.equal(state.currentMode, AppMode.PLAN);
    assert.equal(state.planPreview.isValid(), true);

    state.setMode(AppMode.CAPTURE);

    assert.equal(state.planPreview, null);
  });

  it("restarts to the initial state", () => {
    const state = new AppState({ currentContext: "Steve" });

    state.restart();

    assert.equal(state.currentContext, null);
    assert.equal(state.currentQuery, null);
    assert.equal(state.currentSelection.isEmpty(), true);
    assert.equal(state.currentMode, AppMode.COMMAND);
    assert.equal(state.planPreview, null);
  });
});
