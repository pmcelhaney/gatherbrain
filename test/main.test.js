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
});
