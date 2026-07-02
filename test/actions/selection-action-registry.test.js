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

  it("includes built-in workflow type actions", async () => {
    const registry = SelectionActionRegistry.fromConfig();

    assert.deepEqual(
      registry.keywords().filter((keyword) => [
        "abandoned",
        "inprogress",
        "todo",
        "waiting"
      ].includes(keyword)),
      ["abandoned", "inprogress", "todo", "waiting"]
    );

    assert.equal(registry.preview("waiting", buildFact()).type, "waiting");
    assert.equal(registry.preview("inprogress", buildFact()).type, "inprogress");
    assert.equal(registry.preview("abandoned", buildFact()).type, "abandoned");
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

  it("sets due dates from natural date phrases", async () => {
    const factStore = new MemoryFactStore([buildFact()]);
    const registry = SelectionActionRegistry.fromConfig();

    await registry.execute("next", {
      selection: new Selection(["6f2308de-02e9-45db-8ff0-65ac793f4a24"]),
      factStore,
      today: "2026-06-30",
      actionArgs: ["Friday"]
    });

    assert.equal(
      factStore.fact("6f2308de-02e9-45db-8ff0-65ac793f4a24").dueDate,
      "2026-07-03"
    );
  });

  it("adds tags from dynamic @ selection actions", async () => {
    const factStore = new MemoryFactStore([buildFact()]);
    const registry = SelectionActionRegistry.fromConfig();

    await registry.execute("@Steve\\", {
      selection: new Selection(["6f2308de-02e9-45db-8ff0-65ac793f4a24"]),
      factStore,
      actionArgs: ["Ma"]
    });

    await registry.execute("@steve\\", {
      selection: new Selection(["6f2308de-02e9-45db-8ff0-65ac793f4a24"]),
      factStore,
      actionArgs: ["Ma"]
    });

    assert.deepEqual(
      factStore.fact("6f2308de-02e9-45db-8ff0-65ac793f4a24").tags,
      ["Steve Ma"]
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

  it("opens associated files from selected facts", async () => {
    const fact = buildFact({ file: "launch-notes.txt" });
    const factStore = new MemoryFactStore([fact]);
    const opened = [];
    const registry = SelectionActionRegistry.fromConfig();

    const results = await registry.execute("open", {
      selection: new Selection([fact.id]),
      factStore,
      fileOpener: {
        async openAssociatedFile({ fact: openedFact, factPath }) {
          opened.push({ fact: openedFact, factPath });
          return "/tmp/session/launch-notes.txt";
        }
      }
    });

    assert.deepEqual(results.map((result) => result.action), ["open_file"]);
    assert.equal(opened[0].fact.file, "launch-notes.txt");
    assert.equal(opened[0].factPath, "/tmp/session/fact.md");
  });

  it("rejects open for facts without associated files", async () => {
    const fact = buildFact();
    const factStore = new MemoryFactStore([fact]);
    const registry = SelectionActionRegistry.fromConfig();

    await assert.rejects(
      registry.execute("open", {
        selection: new Selection([fact.id]),
        factStore,
        fileOpener: {
          async openAssociatedFile() {}
        }
      }),
      /no associated file/
    );
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

  it("previews natural date phrase transformations", () => {
    const fact = buildFact();
    const registry = SelectionActionRegistry.fromConfig();

    const preview = registry.preview("June", fact, {
      today: "2026-06-30",
      actionArgs: ["1"]
    });

    assert.equal(preview.dueDate, "2026-06-01");
    assert.equal(fact.dueDate, null);
  });

  it("previews dynamic @ selection actions", () => {
    const fact = buildFact();
    const registry = SelectionActionRegistry.fromConfig();

    const preview = registry.preview("@Steve\\", fact, { actionArgs: ["Ma"] });

    assert.deepEqual(preview.tags, ["Steve Ma"]);
    assert.deepEqual(fact.tags, []);
  });
});

function buildFact(overrides = {}) {
  return new Fact({
    id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
    content: "Mike prefers async architecture reviews.",
    type: "observation",
    createdAt: "2026-06-30T14:15:23.000Z",
    homeSession: "Architecture Review Board",
    ...overrides
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

  async findPathByFactId(id) {
    if (!this.facts.has(id)) {
      return null;
    }

    return "/tmp/session/fact.md";
  }

  async saveFact(fact) {
    this.facts.set(fact.id, fact);
  }

  async trashFact(fact) {
    this.trashedIds.push(fact.id);
  }
}
