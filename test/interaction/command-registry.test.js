import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Fact } from "../../src/domain/index.js";
import { CommandRegistry } from "../../src/interaction/index.js";
import { AppState } from "../../src/state/index.js";

describe("CommandRegistry", () => {
  it("switches the current context", async () => {
    const state = new AppState();
    const result = await new CommandRegistry().execute(":switch Architecture Review Board", {
      state
    });

    assert.equal(result.action, "switch_context");
    assert.equal(state.currentContext.name, "Architecture Review Board");
    assert.equal(state.currentQuery, "context:Architecture Review Board");
  });

  it("switches escaped-space context input to the canonical context name", async () => {
    const state = new AppState();
    const result = await new CommandRegistry().execute(":switch Steve\\ Ma", {
      state
    });

    assert.equal(result.message, "switched to Steve Ma");
    assert.equal(state.currentContext.name, "Steve Ma");
    assert.equal(state.currentQuery, "context:Steve Ma");
  });

  it("requests an app restart without clearing state", async () => {
    const state = new AppState({ currentContext: "Steve" });
    const result = await new CommandRegistry().execute(":restart", { state });

    assert.equal(result.action, "restart");
    assert.equal(state.currentContext.name, "Steve");
  });

  it("requests a paste name", async () => {
    const state = new AppState();
    const result = await new CommandRegistry().execute(":paste", { state });

    assert.equal(result.action, "paste_name_requested");
    assert.equal(result.message, "name this paste");
  });

  it("recognizes undo", async () => {
    const result = await new CommandRegistry().execute(":undo", {});

    assert.equal(result.action, "undo");
  });

  it("recognizes quit and exit as commands", async () => {
    const registry = new CommandRegistry();

    assert.equal((await registry.execute(":quit", {})).action, "exit");
    assert.equal((await registry.execute(":exit", {})).action, "exit");
  });

  it("returns help lines", async () => {
    const state = new AppState();
    const result = await new CommandRegistry().execute(":help", { state });

    assert.equal(result.action, "help");
    assert.match(result.helpLines.join("\n"), /:switch <context>/);
    assert.match(result.helpLines.join("\n"), /:contexts/);
  });

  it("lists known contexts", async () => {
    const state = new AppState({ currentContext: "Steve" });
    const contextRepository = {
      async list() {
        return ["Architecture Review Board", "Steve"];
      }
    };

    const result = await new CommandRegistry().execute(":contexts", {
      state,
      contextRepository
    });

    assert.equal(result.action, "help");
    assert.deepEqual(result.helpLines, [
      "Contexts",
      " 1.   Architecture Review Board",
      " 2. * Steve"
    ]);
  });

  it("switches to a numbered context", async () => {
    const state = new AppState({ currentContext: "Steve" });
    const contextRepository = {
      async list() {
        return ["Architecture Review Board", "Steve"];
      }
    };

    const result = await new CommandRegistry().execute(":context 1", {
      state,
      contextRepository
    });

    assert.equal(result.action, "switch_context");
    assert.equal(state.currentContext.name, "Architecture Review Board");
  });

  it("inspects a visible fact", async () => {
    const fact = new Fact({
      id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      content: "Follow up with Steve.",
      type: "task",
      createdAt: "2026-06-30T15:45:00.000Z",
      dueDate: "2026-07-01",
      homeContext: "Steve",
      associatedContexts: ["Architecture Review Board"]
    });
    const resultSet = {
      factIdForNumber(number) {
        assert.equal(number, 1);
        return fact.id;
      }
    };
    const factRepository = {
      async getFactById(factId) {
        assert.equal(factId, fact.id);
        return fact;
      },
      async findPathByFactId(factId) {
        assert.equal(factId, fact.id);
        return "/tmp/fact.md";
      }
    };

    const result = await new CommandRegistry().execute(":inspect 1", {
      factRepository,
      resultSet
    });

    assert.equal(result.action, "inspect");
    assert.match(result.helpLines.join("\n"), /Fact 5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a/);
    assert.match(result.helpLines.join("\n"), /associated contexts: Architecture Review Board/);
    assert.match(result.helpLines.join("\n"), /attached file: \(none\)/);
    assert.match(result.helpLines.join("\n"), /path: \/tmp\/fact\.md/);
  });
});
