import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CommandRegistry } from "../../src/interaction/index.js";
import { AppState } from "../../src/state/index.js";

describe("CommandRegistry", () => {
  it("switches the current session", async () => {
    const state = new AppState();
    const result = await new CommandRegistry().execute(":switch Architecture Review Board", {
      state
    });

    assert.equal(result.action, "switch_session");
    assert.equal(state.currentSession.name, "Architecture Review Board");
    assert.equal(state.currentQuery, "session:Architecture Review Board");
  });

  it("restarts app state", async () => {
    const state = new AppState({ currentSession: "Steve" });
    const result = await new CommandRegistry().execute(":restart", { state });

    assert.equal(result.action, "restart");
    assert.equal(state.currentSession, null);
  });

  it("recognizes paste before paste mode exists", async () => {
    const state = new AppState();
    const result = await new CommandRegistry().execute(":paste", { state });

    assert.equal(result.action, "paste");
    assert.equal(result.message, "paste mode is not implemented yet");
  });

  it("returns help lines", async () => {
    const state = new AppState();
    const result = await new CommandRegistry().execute(":help", { state });

    assert.equal(result.action, "help");
    assert.match(result.helpLines.join("\n"), /:switch <session>/);
    assert.match(result.helpLines.join("\n"), /:sessions/);
  });

  it("lists known sessions", async () => {
    const state = new AppState({ currentSession: "Steve" });
    const sessionRepository = {
      async list() {
        return ["Architecture Review Board", "Steve"];
      }
    };

    const result = await new CommandRegistry().execute(":sessions", {
      state,
      sessionRepository
    });

    assert.equal(result.action, "help");
    assert.deepEqual(result.helpLines, [
      "Sessions",
      " 1.   Architecture Review Board",
      " 2. * Steve"
    ]);
  });

  it("switches to a numbered session", async () => {
    const state = new AppState({ currentSession: "Steve" });
    const sessionRepository = {
      async list() {
        return ["Architecture Review Board", "Steve"];
      }
    };

    const result = await new CommandRegistry().execute(":session 1", {
      state,
      sessionRepository
    });

    assert.equal(result.action, "switch_session");
    assert.equal(state.currentSession.name, "Architecture Review Board");
  });
});
