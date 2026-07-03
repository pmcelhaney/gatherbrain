import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Fact } from "../../src/domain/index.js";
import { CommandRegistry } from "../../src/interaction/index.js";
import { AppState } from "../../src/state/index.js";

describe("CommandRegistry", () => {
  it("switches the current context", async () => {
    const state = new AppState();
    const result = await new CommandRegistry().execute("@Architecture Review Board", {
      state,
      contextRepository: {
        async list() {
          return ["Architecture Review Board"];
        }
      }
    });

    assert.equal(result.action, "switch_context");
    assert.equal(state.currentContext.name, "Architecture Review Board");
    assert.equal(state.currentQuery, 'context:"Architecture Review Board"');
  });

  it("switches escaped-space context input to the canonical context name", async () => {
    const state = new AppState();
    const result = await new CommandRegistry().execute("@Steve\\ Ma", {
      state,
      contextRepository: {
        async list() {
          return ["Steve Ma"];
        }
      }
    });

    assert.equal(result.message, "switched to Steve Ma");
    assert.equal(state.currentContext.name, "Steve Ma");
    assert.equal(state.currentQuery, 'context:"Steve Ma"');
  });

  it("rejects unknown contexts unless creation is explicit", async () => {
    const state = new AppState({ currentContext: "Steve" });

    await assert.rejects(
      () => new CommandRegistry().execute("@Context\\ That\\ Does\\ Not\\ Exist", {
        state,
        contextRepository: {
          async list() {
            return ["Steve"];
          }
        }
      }),
      /Context does not exist: Context That Does Not Exist\. Add ! to create it\./
    );

    assert.equal(state.currentContext.name, "Steve");
  });

  it("creates missing contexts when the context switch ends with a bang", async () => {
    const state = new AppState({ currentContext: "Steve" });

    const escaped = await new CommandRegistry().execute("@Context\\ That\\ Does\\ Not\\ Exist\\!", {
      state,
      contextRepository: {
        async list() {
          return ["Steve"];
        }
      }
    });

    assert.equal(escaped.action, "switch_context");
    assert.equal(state.currentContext.name, "Context That Does Not Exist");

    const spaced = await new CommandRegistry().execute("@Context That Does Not Exist!", {
      state,
      contextRepository: {
        async list() {
          return ["Steve"];
        }
      }
    });

    assert.equal(spaced.action, "switch_context");
    assert.equal(state.currentContext.name, "Context That Does Not Exist");
  });

  it("switches to a numbered recent context", async () => {
    const state = new AppState({ currentContext: "Steve" });
    const result = await new CommandRegistry().execute("@2", {
      state,
      recentContexts: ["Architecture Review Board", "Steve"]
    });

    assert.equal(result.action, "switch_context");
    assert.equal(state.currentContext.name, "Steve");
  });

  it("switches to a dot-selected recent context", async () => {
    const state = new AppState({ currentContext: "Steve" });
    const result = await new CommandRegistry().execute("@..", {
      state,
      recentContexts: ["Architecture Review Board", "Steve"]
    });

    assert.equal(result.action, "switch_context");
    assert.equal(state.currentContext.name, "Steve");
  });

  it("executes unambiguous command shorthands", async () => {
    const result = await new CommandRegistry().execute(":r", {
      state: new AppState({ currentContext: "Steve" })
    });

    assert.equal(result.action, "restart");
  });

  it("rejects the old switch command", async () => {
    await assert.rejects(
      () => new CommandRegistry().execute(":switch Steve", { state: new AppState() }),
      /Unknown command: switch/
    );
  });

  it("rejects ambiguous command shorthands", async () => {
    await assert.rejects(
      () => new CommandRegistry().execute(":c Steve", {
        state: new AppState(),
        contextRepository: {
          async list() {
            return ["Steve"];
          }
        }
      }),
      /Ambiguous command: c \(:context, :contexts\)/
    );
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
    assert.match(result.helpLines.join("\n"), /@<context>/);
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
