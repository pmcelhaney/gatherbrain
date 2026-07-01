import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Fact } from "../../src/domain/index.js";
import { SelectionActionRegistry } from "../../src/actions/index.js";
import { AppState, Selection } from "../../src/state/index.js";

describe("SelectionActionRegistry", () => {
  it("sets type through the configured DSL", async () => {
    const factStore = new MemoryFactStore([buildFact()]);
    const registry = SelectionActionRegistry.fromConfig();

    await registry.execute("todo", {
      selection: new Selection(["6f2308de-02e9-45db-8ff0-65ac793f4a24"]),
      factStore
    });

    assert.equal(
      factStore.fact("6f2308de-02e9-45db-8ff0-65ac793f4a24").type,
      "todo"
    );
  });

  it("sets relative due dates", async () => {
    const factStore = new MemoryFactStore([buildFact()]);
    const registry = SelectionActionRegistry.fromConfig();

    await registry.execute("tomorrow", {
      selection: new Selection(["6f2308de-02e9-45db-8ff0-65ac793f4a24"]),
      factStore,
      today: "2026-06-30"
    });

    assert.equal(
      factStore.fact("6f2308de-02e9-45db-8ff0-65ac793f4a24").dueDate,
      "2026-07-01"
    );
  });

  it("sets due dates to today", async () => {
    const factStore = new MemoryFactStore([buildFact()]);
    const registry = SelectionActionRegistry.fromConfig();

    await registry.execute("today", {
      selection: new Selection(["6f2308de-02e9-45db-8ff0-65ac793f4a24"]),
      factStore,
      today: "2026-06-30"
    });

    assert.equal(
      factStore.fact("6f2308de-02e9-45db-8ff0-65ac793f4a24").dueDate,
      "2026-06-30"
    );
  });

  it("associates selected facts with the current session", async () => {
    const factStore = new MemoryFactStore([buildFact()]);
    const registry = SelectionActionRegistry.fromConfig();

    await registry.execute("gather", {
      selection: new Selection(["6f2308de-02e9-45db-8ff0-65ac793f4a24"]),
      factStore,
      state: new AppState({ currentSession: "Steve" })
    });

    assert.deepEqual(
      factStore
        .fact("6f2308de-02e9-45db-8ff0-65ac793f4a24")
        .associatedSessions.map((session) => session.name),
      ["Steve"]
    );
  });

  it("trashes selected facts", async () => {
    const factStore = new MemoryFactStore([buildFact()]);
    const registry = SelectionActionRegistry.fromConfig();

    await registry.execute("delete", {
      selection: new Selection(["6f2308de-02e9-45db-8ff0-65ac793f4a24"]),
      factStore
    });

    assert.deepEqual(factStore.trashedIds, ["6f2308de-02e9-45db-8ff0-65ac793f4a24"]);
  });

  it("previews configured transformations without mutating the original fact", () => {
    const fact = buildFact();
    const registry = SelectionActionRegistry.fromConfig();

    const preview = registry.preview("done", fact);

    assert.equal(preview.type, "done");
    assert.equal(fact.type, "observation");
  });

  it("previews relative due date transformations", () => {
    const fact = buildFact();
    const registry = SelectionActionRegistry.fromConfig();

    const preview = registry.preview("tomorrow", fact, { today: "2026-06-30" });

    assert.equal(preview.dueDate, "2026-07-01");
    assert.equal(fact.dueDate, null);
  });
});

function buildFact() {
  return new Fact({
    id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
    content: "Mike prefers async architecture reviews.",
    type: "observation",
    createdAt: "2026-06-30T14:15:23.000Z",
    homeSession: "Architecture Review Board"
  });
}

class MemoryFactStore {
  constructor(facts) {
    this.facts = new Map(facts.map((fact) => [fact.id, fact]));
    this.trashedIds = [];
  }

  fact(id) {
    return this.facts.get(id);
  }

  async getFactById(id) {
    return this.fact(id);
  }

  async saveFact(fact) {
    this.facts.set(fact.id, fact);
  }

  async trashFact(fact) {
    this.trashedIds.push(fact.id);
  }
}
