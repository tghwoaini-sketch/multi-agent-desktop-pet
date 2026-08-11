import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, predicate, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await fetch(url).then((response) => response.json());
      if (predicate(value)) return value;
    } catch { /* The child server is still starting. */ }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test("WorkBuddy keeps completion mounted until click and persists acknowledgement", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "xiaobu-workbuddy-test-"));
  const workbuddy = join(root, "workbuddy");
  const project = join(workbuddy, "projects", "fixture");
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const rollout = join(project, `${sessionId}.jsonl`);
  const control = join(root, "control.json");
  const display = join(root, "display.json");
  const cliLog = join(root, "cli.log");
  const fakeCli = join(root, "openpets-cli");
  const port = 43281;
  await mkdir(join(workbuddy, "app"), { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(workbuddy, "app", "sessions.json"), JSON.stringify({ sessions: [{ conversationId: sessionId, workDir: "/tmp/WorkBuddy测试" }] }));
  await writeFile(control, JSON.stringify({ paused: false }));
  await writeFile(fakeCli, `#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");\n`);
  await chmod(fakeCli, 0o755);
  await writeFile(rollout, [
    JSON.stringify({ timestamp: Date.now(), type: "message", role: "user", content: "<user_query>@image#1:Clipboard_Screenshot.png，整理测试文件并输出清单</user_query>" }),
    JSON.stringify({ timestamp: Date.now() + 1, type: "reasoning" }),
  ].join("\n") + "\n");

  const launch = () => spawn(process.execPath, ["scripts/workbuddy-task-bridge.mjs"], {
    cwd: process.cwd(),
    stdio: "ignore",
    env: {
      ...process.env,
      XIAOBU_WORKBUDDY_ROOT: workbuddy,
      XIAOBU_CODEX_CONTROL_STATE: control,
      XIAOBU_WORKBUDDY_DISPLAY_STATE: display,
      XIAOBU_OPENPETS_CLI: fakeCli,
      XIAOBU_WORKBUDDY_BRIDGE_PORT: String(port),
      XIAOBU_WORKBUDDY_DISABLE_ACTIVATE: "1",
      FAKE_CLI_LOG: cliLog,
    },
  });
  let child = launch();
  context.after(() => child.kill("SIGKILL"));

  const active = await waitFor(`http://127.0.0.1:${port}/tasks`, (value) => value.tasks?.[0]?.state === "active");
  assert.equal(active.tasks.length, 1);
  assert.equal(active.tasks[0].title, "整理测试文件并输出清单");
  const firstCalls = (await readFile(cliLog, "utf8")).trim().split("\n").map(JSON.parse);
  const notify = firstCalls.find((args) => args[0] === "notify");
  assert.ok(notify);
  assert.equal(notify[notify.indexOf("--thread") + 1], sessionId);
  assert.ok(notify.some((value) => String(value).startsWith("xiaobu-task://workbuddy?task=")));

  await appendFile(rollout, JSON.stringify({
    timestamp: Date.now() + 2,
    type: "function_call",
    name: "request_user_input",
    callId: "question-1",
  }) + "\n");
  const review = await waitFor(`http://127.0.0.1:${port}/tasks`, (value) => value.tasks?.[0]?.state === "review");
  assert.equal(review.tasks[0].note, "等待你确认或补充信息");
  const reviewCalls = (await readFile(cliLog, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  const reviewNotify = reviewCalls.find((args) => args[0] === "notify" && args.includes("review"));
  assert.ok(reviewNotify);
  assert.ok(reviewNotify.some((value) => String(value).includes("需要你")));
  assert.ok(reviewNotify.some((value) => String(value).includes("需要你的回复才能继续")));

  await appendFile(rollout, JSON.stringify({
    timestamp: Date.now() + 3,
    type: "function_call_result",
    callId: "question-1",
  }) + "\n");
  await waitFor(`http://127.0.0.1:${port}/tasks`, (value) => value.tasks?.[0]?.state === "active");

  await appendFile(rollout, JSON.stringify({
    timestamp: Date.now() + 4,
    type: "message",
    role: "assistant",
    status: "completed",
    message: { content: "已完成" },
    providerData: { rawUsage: { total_token: 1 } },
  }) + "\n");
  await waitFor(`http://127.0.0.1:${port}/tasks`, (value) => value.tasks?.[0]?.state === "completed");
  let finalCalls = (await readFile(cliLog, "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(finalCalls.some((args) => args[0] === "notify" && args.includes("done") && args.includes(sessionId)));
  assert.ok(!finalCalls.some((args) => args[0] === "clear" && args.includes(sessionId)));

  const opened = await fetch(`http://127.0.0.1:${port}/open-task?task=${sessionId}`);
  assert.equal(opened.status, 200);
  assert.match(await opened.text(), /window\.close/);
  await waitFor(`http://127.0.0.1:${port}/tasks`, (value) => value.connected && value.tasks?.length === 0);
  finalCalls = (await readFile(cliLog, "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(finalCalls.some((args) => args[0] === "clear" && args.includes(sessionId)));

  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));
  const callsBeforeRestart = finalCalls.length;
  child = launch();
  await waitFor(`http://127.0.0.1:${port}/tasks`, (value) => value.connected && value.tasks?.length === 0);
  await sleep(3500);
  const callsAfterRestart = (await readFile(cliLog, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(callsAfterRestart.length, callsBeforeRestart);
});
