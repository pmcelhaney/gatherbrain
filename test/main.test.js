import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

describe("main", () => {
  it("restarts by launching a fresh process with the current command", async () => {
    const { restartCurrentProcess } = await import("../src/main.js");
    const calls = [];
    let exitCode = null;
    const child = new EventEmitter();

    const restarted = restartCurrentProcess({
      execPath: "/usr/local/bin/node",
      argv: ["/usr/local/bin/node", "src/main.js"],
      env: { GATHERBRAIN_WORKSPACE: "/tmp/workspace" },
      cwd: "/tmp/project",
      pid: 12345,
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        return child;
      },
      exit(code) {
        exitCode = code;
      }
    });

    assert.equal(exitCode, null);
    child.emit("close", 0, null);
    await restarted;

    assert.deepEqual(calls, [
      {
        command: "/usr/local/bin/node",
        args: ["src/main.js"],
        options: {
          cwd: "/tmp/project",
          env: {
            GATHERBRAIN_WORKSPACE: "/tmp/workspace",
            GATHERBRAIN_RESTART_PARENT_PID: "12345"
          },
          stdio: "inherit"
        }
      }
    ]);
    assert.equal(exitCode, 0);
  });

  it("renders the app once for smoke testing", () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-render-once-"));
    const result = spawnSync("node", ["src/main.js", "--render-once"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        GATHERBRAIN_WORKSPACE: workspacePath
      }
    });

    fs.rmSync(workspacePath, { recursive: true, force: true });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /sessions\/\(no session\)/);
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

  it("exits on quit commands with surrounding whitespace", () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-exit-"));

    const result = spawnSync("node", ["src/main.js"], {
      cwd: process.cwd(),
      input: " :exit  \nThis should not run.\n",
      encoding: "utf8",
      env: {
        ...process.env,
        GATHERBRAIN_WORKSPACE: workspacePath
      }
    });

    fs.rmSync(workspacePath, { recursive: true, force: true });

    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /This should not run/);
    assert.doesNotMatch(result.stdout, /unknown command/i);
  });

  it("exits on :quit", () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-quit-"));

    const result = spawnSync("node", ["src/main.js"], {
      cwd: process.cwd(),
      input: ":quit\nThis should not run.\n",
      encoding: "utf8",
      env: {
        ...process.env,
        GATHERBRAIN_WORKSPACE: workspacePath
      }
    });

    fs.rmSync(workspacePath, { recursive: true, force: true });

    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /This should not run/);
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

  it("pauses tty input after quitting the interactive app", async () => {
    const { runTui } = await import("../src/main.js");
    const input = new EventEmitter();
    const output = {
      columns: 80,
      rows: 24,
      writes: [],
      write(value) {
        this.writes.push(value);
      }
    };
    const rawModes = [];
    let paused = false;
    input.setRawMode = (value) => rawModes.push(value);
    input.pause = () => {
      paused = true;
    };

    const run = runTui({
      render() {
        return "";
      }
    }, { inputStream: input, outputStream: output });

    input.emit("keypress", ":", { sequence: ":", name: undefined });
    input.emit("keypress", "q", { sequence: "q", name: undefined });
    input.emit("keypress", "u", { sequence: "u", name: undefined });
    input.emit("keypress", "i", { sequence: "i", name: undefined });
    input.emit("keypress", "t", { sequence: "t", name: undefined });
    input.emit("keypress", "\r", { sequence: "\r", name: "return" });

    await run;

    assert.deepEqual(rawModes, [true, false]);
    assert.equal(paused, true);
    assert.equal(input.listenerCount("keypress"), 0);
  });

  it("cycles repeated tab completions from the original prefix", async () => {
    const { runTui } = await import("../src/main.js");
    const input = new EventEmitter();
    const output = {
      columns: 80,
      rows: 24,
      writes: [],
      write(value) {
        this.writes.push(value);
      }
    };
    const rawModes = [];
    const completions = ["@Stacy", "@Stan", "@Steve\\ Ma"];
    const completeCalls = [];
    const renderedInputs = [];
    input.setRawMode = (value) => rawModes.push(value);
    input.pause = () => {};

    const run = runTui({
      render({ input: renderedInput }) {
        renderedInputs.push(renderedInput);
        return "";
      },
      async complete(value, options) {
        completeCalls.push({ value, options });
        return completions[options.completionIndex % completions.length];
      },
      async submit() {
        return { action: "exit" };
      }
    }, { inputStream: input, outputStream: output });

    input.emit("keypress", "@", { sequence: "@", name: undefined });
    input.emit("keypress", "S", { sequence: "S", name: undefined });
    input.emit("keypress", "t", { sequence: "t", name: undefined });
    input.emit("keypress", "\t", { sequence: "\t", name: "tab" });
    await new Promise((resolve) => setImmediate(resolve));
    input.emit("keypress", "\t", { sequence: "\t", name: "tab" });
    await new Promise((resolve) => setImmediate(resolve));
    input.emit("keypress", "\t", { sequence: "\t", name: "tab" });
    await new Promise((resolve) => setImmediate(resolve));
    input.emit("keypress", "\r", { sequence: "\r", name: "return" });

    await run;

    assert.deepEqual(completeCalls, [
      { value: "@St", options: { completionIndex: 0 } },
      { value: "@St", options: { completionIndex: 1 } },
      { value: "@St", options: { completionIndex: 2 } }
    ]);
    assert.deepEqual(renderedInputs.slice(-4), ["@St", "@Stacy", "@Stan", "@Steve\\ Ma"]);
    assert.deepEqual(rawModes, [true, false]);
  });

  it("moves to the start and end of input with ctrl+a and ctrl+e", async () => {
    const { runTui } = await import("../src/main.js");
    const input = new EventEmitter();
    const output = {
      columns: 80,
      rows: 24,
      writes: [],
      write(value) {
        this.writes.push(value);
      }
    };
    const renderedInputs = [];
    const submitted = [];
    input.setRawMode = () => {};
    input.pause = () => {};

    const run = runTui({
      render({ input: renderedInput, cursor }) {
        renderedInputs.push({ input: renderedInput, cursor });
        return "";
      },
      async submit(value) {
        submitted.push(value);
        return { action: "exit" };
      }
    }, { inputStream: input, outputStream: output });

    input.emit("keypress", "a", { sequence: "a", name: undefined });
    input.emit("keypress", "c", { sequence: "c", name: undefined });
    input.emit("keypress", "\u0001", { sequence: "\u0001", name: "a", ctrl: true });
    input.emit("keypress", "b", { sequence: "b", name: undefined });
    input.emit("keypress", "\u0005", { sequence: "\u0005", name: "e", ctrl: true });
    input.emit("keypress", "d", { sequence: "d", name: undefined });
    input.emit("keypress", "\r", { sequence: "\r", name: "return" });

    await run;

    assert.deepEqual(renderedInputs.slice(-6), [
      { input: "a", cursor: 1 },
      { input: "ac", cursor: 2 },
      { input: "ac", cursor: 0 },
      { input: "bac", cursor: 1 },
      { input: "bac", cursor: 3 },
      { input: "bacd", cursor: 4 }
    ]);
    assert.deepEqual(submitted, ["bacd"]);
  });

  it("suspends raw tty input while edit selection commands run", async () => {
    const { runTui } = await import("../src/main.js");
    const input = new EventEmitter();
    const output = {
      columns: 80,
      rows: 24,
      writes: [],
      write(value) {
        this.writes.push(value);
      }
    };
    const rawModes = [];
    const pauseCalls = [];
    const resumeCalls = [];
    let resolveSubmit;
    input.setRawMode = (value) => rawModes.push(value);
    input.pause = () => pauseCalls.push("pause");
    input.resume = () => resumeCalls.push("resume");

    const run = runTui({
      render() {
        return "";
      },
      async submit() {
        return new Promise((resolve) => {
          resolveSubmit = () => resolve({ message: "editing /tmp/fact.md" });
        });
      }
    }, { inputStream: input, outputStream: output });

    input.emit("keypress", ".", { sequence: ".", name: undefined });
    input.emit("keypress", " ", { sequence: " ", name: undefined });
    input.emit("keypress", "e", { sequence: "e", name: undefined });
    input.emit("keypress", "d", { sequence: "d", name: undefined });
    input.emit("keypress", "i", { sequence: "i", name: undefined });
    input.emit("keypress", "t", { sequence: "t", name: undefined });
    input.emit("keypress", "\r", { sequence: "\r", name: "return" });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(rawModes, [true, false]);
    assert.deepEqual(pauseCalls, ["pause"]);
    assert.deepEqual(resumeCalls, []);

    resolveSubmit();
    await new Promise((resolve) => setImmediate(resolve));
    input.emit("keypress", ":", { sequence: ":", name: undefined });
    input.emit("keypress", "q", { sequence: "q", name: undefined });
    input.emit("keypress", "u", { sequence: "u", name: undefined });
    input.emit("keypress", "i", { sequence: "i", name: undefined });
    input.emit("keypress", "t", { sequence: "t", name: undefined });
    input.emit("keypress", "\r", { sequence: "\r", name: "return" });

    await run;

    assert.deepEqual(rawModes, [true, false, true, false]);
    assert.deepEqual(resumeCalls, ["resume"]);
  });
});

describe("createAppRuntime", () => {
  it("returns an exit action when quit reaches runtime command dispatch", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-runtime-quit-"));
    const runtime = createAppRuntime({ workspacePath });

    await runtime.initialize();
    const result = await runtime.submit(":quit");

    assert.equal(result.action, "exit");

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

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

    assert.match(rendered, /9:00  \?  Steve · 1h/);
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
    assert.match(planRendered, /9:00  ●  Steve · 1h/);

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

    assert.match(rendered, /sessions\/new session/);
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
    await firstRuntime.submit("Visible task.");
    await firstRuntime.submit(". task");
    await firstRuntime.submit("Hidden fact.");
    await firstRuntime.submit("/type:task");

    const secondRuntime = createAppRuntime({ workspacePath, clock });
    await secondRuntime.initialize();
    const rendered = secondRuntime.render();

    assert.match(rendered, /Visible task/);
    assert.doesNotMatch(rendered, /Hidden fact/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("returns to the current session view on empty submit", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-empty-submit-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Task fact.");
    await runtime.submit(". task");
    await runtime.submit("Plain fact.");
    await runtime.submit("/type:task");
    assert.match(runtime.render(), /Task fact/);
    assert.doesNotMatch(runtime.render(), /Plain fact/);

    const result = await runtime.submit("");

    assert.equal(result.action, "reset_to_current_session");
    assert.match(runtime.render(), /Task fact/);
    assert.match(runtime.render(), /Plain fact/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("pastes clipboard text into a named file and creates a file fact", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-paste-text-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-07-01T12:00:00.000Z"),
      idGenerator: () => "11111111-1111-4111-8111-111111111111",
      clipboardReader: {
        async read() {
          return {
            mediaType: "text/plain",
            extension: "txt",
            data: Buffer.from("clipboard contents\n")
          };
        }
      }
    });

    await runtime.submit(":switch Steve");
    const prompt = await runtime.submit(":paste");
    const result = await runtime.submit("Launch notes");

    assert.equal(prompt.message, "name this paste");
    assert.equal(result.message, "pasted launch-notes.txt");
    assert.equal(
      fs.readFileSync(path.join(workspacePath, "Steve", "launch-notes.txt"), "utf8"),
      "clipboard contents\n"
    );
    assert.match(runtime.render(), /file Launch notes/);
    assert.equal(
      fs.readFileSync(
        path.join(workspacePath, "Steve", "11111111-1111-4111-8111-111111111111-launch-notes.md"),
        "utf8"
      ),
      `---
id: 11111111-1111-4111-8111-111111111111
type: file
created: 2026-07-01T12:00:00.000Z
associated_sessions:
tags:
due: 
file: launch-notes.txt
url: ${""}
---
Launch notes
`
    );

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("pastes clipboard screenshots as PNG files and creates file facts", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-paste-png-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-07-01T12:00:00.000Z"),
      idGenerator: () => "22222222-2222-4222-8222-222222222222",
      clipboardReader: {
        async read() {
          return {
            mediaType: "image/png",
            extension: "png",
            data: Buffer.from([0x89, 0x50, 0x4e, 0x47])
          };
        }
      }
    });

    await runtime.submit(":switch Steve");
    await runtime.submit(":paste");
    const result = await runtime.submit("Login Screenshot");

    assert.equal(result.message, "pasted login-screenshot.png");
    assert.deepEqual(
      fs.readFileSync(path.join(workspacePath, "Steve", "login-screenshot.png")),
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    );
    assert.equal(
      fs.readFileSync(
        path.join(workspacePath, "Steve", "22222222-2222-4222-8222-222222222222-login-screenshot.md"),
        "utf8"
      ),
      `---
id: 22222222-2222-4222-8222-222222222222
type: file
created: 2026-07-01T12:00:00.000Z
associated_sessions:
tags:
due: 
file: login-screenshot.png
url: ${""}
---
Login Screenshot
`
    );

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("opens files associated with selected facts", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-open-file-"));
    const opened = [];
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-07-01T12:00:00.000Z"),
      idGenerator: () => "33333333-3333-4333-8333-333333333333",
      clipboardReader: {
        async read() {
          return {
            mediaType: "text/plain",
            extension: "txt",
            data: Buffer.from("clipboard contents\n")
          };
        }
      },
      fileOpener: {
        async openAssociatedFile({ fact, factPath }) {
          opened.push({ file: fact.file, factPath });
          return path.join(path.dirname(factPath), fact.file);
        }
      }
    });

    await runtime.submit(":switch Steve");
    await runtime.submit(":paste");
    await runtime.submit("Launch notes");
    const result = await runtime.submit(". open");

    assert.equal(result.message, "opened launch-notes.txt");
    assert.deepEqual(opened, [{
      file: "launch-notes.txt",
      factPath: path.join(workspacePath, "Steve", "33333333-3333-4333-8333-333333333333-launch-notes.md")
    }]);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("previews selected rows while typing selectors", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-selection-preview-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");

    assert.match(runtime.render({ input: "1" }), />\+ 1\. Follow up with Steve/);
    assert.match(runtime.render({ input: "." }), />\+ 1\. Follow up with Steve/);
    assert.equal(runtime.state.currentMode, "Capture");

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("previews selection transformations before submit", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-transform-preview-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");

    const rendered = runtime.render({ input: "1 done" });

    assert.match(rendered, />\+ 1\. done Follow up with Steve/);
    assert.match(runtime.render(), /1\. Follow up with Steve/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("previews due date transformations before submit", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-due-preview-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");

    const rendered = runtime.render({ input: "1 tomorrow" });

    assert.match(rendered, /tomorrow Follow up with Steve/);
    assert.doesNotMatch(runtime.render(), /tomorrow Follow up with Steve/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("marks selected facts due today", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-due-today-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch empty-space");
    await runtime.submit("first item in empty");
    const result = await runtime.submit(". today");

    assert.equal(result.message, "today applied to 1 fact");
    assert.match(runtime.render(), /today first item in empty/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("adds tags to selected facts", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-add-tag-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch empty-space");
    await runtime.submit("first item in empty");
    const preview = runtime.render({ input: ". @Steve\\ Ma" });
    const result = await runtime.submit(". @Steve\\ Ma");

    assert.match(preview, />\+ 1\. first item in empty >Steve Ma/);
    assert.equal(result.message, "@Steve\\ Ma applied to 1 fact");
    assert.match(runtime.render(), /\+ 1\. first item in empty >Steve Ma/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("does not append selected tags already mentioned in fact text", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-add-inline-tag-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch empty-space");
    await runtime.submit("Ask @Steve\\ Ma about the launch");
    await runtime.submit(". @Steve\\ Ma");

    assert.match(runtime.render(), /Ask @Steve Ma about the launch/);
    assert.doesNotMatch(runtime.render(), />Steve Ma/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("prefixes current-context facts with plus during search", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-context-prefix-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Shared search term in Steve.");
    await runtime.submit(":switch Architecture Review Board");
    await runtime.submit("Shared search term in Architecture.");
    await runtime.submit("/Shared");

    const rendered = runtime.render();

    assert.match(rendered, /\+ 1\. Shared search term in Architecture/);
    assert.match(rendered, /\n  2\. \[Steve\] Shared search term in Steve/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("restarts the app and keeps current workspace state", async () => {
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

    assert.match(rendered, /Follow up with Steve/);
    assert.doesNotMatch(rendered, /:switch <session>/);
    assert.match(planRendered, /9:00  ●  Steve · 1h/);

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
    assert.match(rendered, /2\. \* Steve/);
    assert.match(rendered, /1\.   Architecture Review Board/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("switches sessions by number from the session list", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-numbered-session-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Steve-only fact.");
    await runtime.submit(":switch Architecture Review Board");
    await runtime.submit("Architecture fact.");
    await runtime.submit(":session 2");

    const rendered = runtime.render();

    assert.match(rendered, /sessions\/Steve/);
    assert.match(rendered, /Steve-only fact/);
    assert.doesNotMatch(rendered, /Architecture fact/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("inspects visible fact details", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-inspect-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");
    await runtime.submit(":inspect 1");

    const rendered = runtime.render();

    assert.match(rendered, /Fact [0-9a-f-]{36}/);
    assert.match(rendered, /type: fact/);
    assert.match(rendered, /home session: Steve/);
    assert.match(rendered, /attached file: \(none\)/);
    assert.match(rendered, /path: .*follow-up-with-steve\.md/);
    assert.match(rendered, /Follow up with Steve\./);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("undoes the last selection metadata change", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-undo-type-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");
    await runtime.submit(". task");
    assert.match(runtime.render(), /task Follow up with Steve/);

    const result = await runtime.submit(":undo");

    assert.equal(result.message, "undid last selection action");
    assert.match(runtime.render(), /1\. Follow up with Steve/);
    assert.doesNotMatch(runtime.render(), /task Follow up with Steve/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("undoes the last selection delete", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-undo-delete-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("Follow up with Steve.");
    await runtime.submit(". delete");
    assert.doesNotMatch(runtime.render(), /Follow up with Steve/);

    await runtime.submit(":undo");

    assert.match(runtime.render(), /Follow up with Steve/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("updates visible timeboxes by number", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-timebox-update-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit("; 9-10 Steve");
    await runtime.submit(":timebox 1 10-11 Architecture Review Board");

    const rendered = runtime.render({ input: ";" });

    assert.match(rendered, /10:00  ●  Architecture Review Board · 1h/);
    assert.doesNotMatch(rendered, /9:00  ●  Steve · 1h/);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("deletes visible timeboxes by number", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-timebox-delete-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit("; 9-10 Steve");
    await runtime.submit("; 11-12 Counterfact");
    await runtime.submit(":timebox delete 1");

    const rendered = runtime.render({ input: ";" });

    assert.doesNotMatch(rendered, /9:00  ●  Steve · 1h/);
    assert.match(rendered, /11:00  ●  Counterfact · 1h/);

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

  it("completes capture tags from saved facts", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-tag-complete-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve");
    await runtime.submit("@Devin's trial ends.");

    assert.equal(await runtime.complete("Confirm @Dev"), "Confirm @Devin");
    assert.equal(await runtime.complete("@St"), "@Steve");

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

  it("renders facts captured after switching with an escaped-space session name", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-escaped-session-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-06-30T12:00:00.000Z")
    });

    await runtime.submit(":switch Steve\\ Ma");
    await runtime.submit("Follow up with Steve.");

    const rendered = runtime.render();
    assert.match(rendered, /sessions\/Steve Ma/);
    assert.match(rendered, /Follow up with Steve/);

    const factMarkdown = fs.readFileSync(
      path.join(
        workspacePath,
        "Steve Ma",
        fs.readdirSync(path.join(workspacePath, "Steve Ma")).find((name) => name.endsWith(".md"))
      ),
      "utf8"
    );
    assert.doesNotMatch(factMarkdown, /^home_session:/m);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("renders facts captured after switching to a slash-separated session subdirectory", async () => {
    const { createAppRuntime } = await import("../src/main.js");
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "gatherbrain-nested-session-"));
    const runtime = createAppRuntime({
      workspacePath,
      clock: () => new Date("2026-07-08T12:00:00.000Z")
    });

    await runtime.submit(":switch Technology Assembly/2026-07-08");
    await runtime.submit("Prep the assembly agenda.");

    const rendered = runtime.render();
    assert.match(rendered, /sessions\/Technology Assembly\/2026-07-08/);
    assert.match(rendered, /Prep the assembly agenda/);

    const sessionDirectory = path.join(workspacePath, "Technology Assembly", "2026-07-08");
    const factMarkdown = fs.readFileSync(
      path.join(sessionDirectory, fs.readdirSync(sessionDirectory).find((name) => name.endsWith(".md"))),
      "utf8"
    );
    assert.doesNotMatch(factMarkdown, /^home_session:/m);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });
});
