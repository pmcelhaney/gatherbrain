import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

describe("main", () => {
  it("renders the app once for smoke testing", () => {
    const result = spawnSync("node", ["src/main.js", "--render-once"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /sessions\/2026-06-30\/\(no session\)/);
    assert.match(result.stdout, /^-{80}$/m);
    assert.match(result.stdout, />\n$/);
  });

  it("runs commands and search through npm start runtime plumbing", () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-main-"));

    const result = spawnSync("node", ["src/main.js"], {
      cwd: process.cwd(),
      input: ":switch Steve\nFollow up with Steve.\n/Steve\n. tomorrow\n; 9-10 Steve\n:exit\n",
      encoding: "utf8",
      env: {
        ...process.env,
        GATHERBRAIN_WORKSPACE: workspacePath
      }
    });

    fs.rmSync(workspacePath, { recursive: true, force: true });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /switched to Steve/);
    assert.match(result.stdout, /captured fact/);
    assert.match(result.stdout, /1 result/);
    assert.match(result.stdout, /tomorrow applied to 1 fact/);
    assert.match(result.stdout, /planned 09:00-10:00 Steve/);
  });

  it("renders help in the body", () => {
    const result = spawnSync("node", ["src/main.js"], {
      cwd: process.cwd(),
      input: ":help\n:exit\n",
      encoding: "utf8"
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /:switch <session>/);
    assert.match(result.stdout, /plain text\s+capture a fact/);
  });
});

describe("createAppRuntime", () => {
  it("previews prompt mode while typing without mutating state", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-preview-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");

    const rendered = runtime.render({ input: ";", showCursor: true });

    assert.match(rendered, /Plan input is required/);
    assert.doesNotMatch(rendered, /Follow up with Steve/);
    assert.match(rendered, /> ;█/);
    assert.equal(runtime.state.currentMode, "Capture");

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("previews plan input without committing it", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-plan-preview-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    const rendered = runtime.render({ input: "; 9-10 Steve", showCursor: true });

    assert.match(rendered, /\? 09:00-10:00 Steve/);
    assert.equal(runtime.state.planPreview, null);
    assert.equal(fs.existsSync(path.join(workspacePath, "timeboxes", "2026-06-30.txt")), false);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("restores persisted facts and today's timeboxes on startup", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-startup-"));
    const clock = () => new Date("2026-06-30T12:00:00.000Z");
    const firstRuntime = createAppRuntime({ workspacePath, clock });

    await firstRuntime.submit(":switch Steve");
    await firstRuntime.submit("Follow up with Steve.");
    await firstRuntime.submit("; 9-10 Steve");

    const secondRuntime = createAppRuntime({ workspacePath, clock });
    await secondRuntime.initialize();

    const rendered = secondRuntime.render();
    const planRendered = secondRuntime.render({ input: ";" });

    assert.match(rendered, /Follow up with Steve/);
    assert.match(planRendered, /09:00-10:00 Steve/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("restores the last session and query on startup", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-state-restore-"));
    const clock = () => new Date("2026-06-30T12:00:00.000Z");
    const firstRuntime = createAppRuntime({ workspacePath, clock });

    await firstRuntime.submit(":switch Steve");
    await firstRuntime.submit("Steve-only fact.");
    await firstRuntime.submit(":switch new session");
    await firstRuntime.submit("New-session fact.");

    const secondRuntime = createAppRuntime({ workspacePath, clock });
    await secondRuntime.initialize();
    const rendered = secondRuntime.render();

    assert.match(rendered, /sessions\/2026-06-30\/new session/);
    assert.match(rendered, /New-session fact/);
    assert.doesNotMatch(rendered, /Steve-only fact/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("restores the last explicit query on startup", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-query-restore-"));
    const clock = () => new Date("2026-06-30T12:00:00.000Z");
    const firstRuntime = createAppRuntime({ workspacePath, clock });

    await firstRuntime.submit(":switch Steve");
    await firstRuntime.submit("Visible todo.");
    await firstRuntime.submit(". todo");
    await firstRuntime.submit("Hidden fact.");
    await firstRuntime.submit("/type:todo");

    const secondRuntime = createAppRuntime({ workspacePath, clock });
    await secondRuntime.initialize();
    const rendered = secondRuntime.render();

    assert.match(rendered, /Visible todo/);
    assert.doesNotMatch(rendered, /Hidden fact/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("clears retained screen state on restart", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-restart-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");
    await runtime.submit("; 9-10 Steve");
    await runtime.submit(":help");
    await runtime.submit(":restart");

    const rendered = runtime.render();
    const planRendered = runtime.render({ input: ";" });

    assert.doesNotMatch(rendered, /Follow up with Steve/);
    assert.doesNotMatch(rendered, /:switch <session>/);
    assert.match(rendered, /\.\.\./);
    assert.doesNotMatch(planRendered, /09:00-10:00 Steve/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("lists discovered sessions in the terminal body", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-sessions-command-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");
    await runtime.submit("; 9-10 Architecture Review Board");
    await runtime.submit(":sessions");

    const rendered = runtime.render();

    assert.match(rendered, /Sessions/);
    assert.match(rendered, /\* Steve/);
    assert.match(rendered, /  Architecture Review Board/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("uses configured fact type and selection actions", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-config-runtime-"));
    const runtime = createAppRuntime({
      workspacePath,
      config: {
        defaultFactType: "note",
        selectionActions: {
          actions: {
            idea: { action: "set_type", value: "idea" }
          }
        }
      },
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");

    let rendered = runtime.render();
    assert.match(rendered, /note Follow up with Steve/);

    assert.equal(await runtime.complete(". i"), ". idea");
    await runtime.submit(". idea");

    rendered = runtime.render();
    assert.match(rendered, /idea Follow up with Steve/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("shows only facts associated with the switched session", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-switch-view-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Steve-only fact.");
    await runtime.submit(":switch new session");

    let rendered = runtime.render();
    assert.doesNotMatch(rendered, /Steve-only fact/);
    assert.match(rendered, /\.\.\./);

    await runtime.submit("New-session fact.");
    rendered = runtime.render();

    assert.match(rendered, /New-session fact/);
    assert.doesNotMatch(rendered, /Steve-only fact/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });
});
