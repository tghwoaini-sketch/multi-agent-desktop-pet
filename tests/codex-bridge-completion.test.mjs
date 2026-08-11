import assert from "node:assert/strict";
import { appendFile, chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
    } catch { /* The bridge is still starting. */ }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForCalls(path, predicate, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const calls = (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
      if (predicate(calls)) return calls;
    } catch { /* The fake CLI has not written its first call yet. */ }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for calls in ${path}`);
}

test("Codex keeps a completed live task until acknowledgement without reviving history", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "xiaobu-codex-test-"));
  const taskId = "22222222-2222-4222-8222-222222222222";
  const rollout = join(root, "rollout.jsonl");
  const fixture = join(root, "fixture.json");
  const control = join(root, "control.json");
  const threadState = join(root, "threads.json");
  const cliLog = join(root, "cli.log");
  const fakeCli = join(root, "openpets-cli");
  const fakeCodex = join(root, "codex");
  const port = 43282;

  await writeFile(control, JSON.stringify({ paused: false }));
  await writeFile(rollout, JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }) + "\n");
  await writeFile(fixture, JSON.stringify({
    id: taskId,
    name: "验证完成气泡",
    preview: "执行集成测试",
    status: { type: "active" },
    recencyAt: Math.floor(Date.now() / 1000),
    createdAt: Math.floor(Date.now() / 1000),
    path: rollout,
  }));
  await writeFile(fakeCli, `#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");console.log("ok");\n`);
  await chmod(fakeCli, 0o755);
  await writeFile(fakeCodex, `#!/usr/bin/env node\nconst fs=require("node:fs"),readline=require("node:readline");const rl=readline.createInterface({input:process.stdin});rl.on("line",line=>{const m=JSON.parse(line);if(!m.id)return;const result=m.method==="thread/list"?{data:[JSON.parse(fs.readFileSync(process.env.CODEX_FIXTURE,"utf8"))]}:{};process.stdout.write(JSON.stringify({id:m.id,result})+"\\n")});\n`);
  await chmod(fakeCodex, 0o755);

  const launch = () => spawn(process.execPath, ["scripts/codex-task-bridge.mjs"], {
    cwd: process.cwd(),
    stdio: "ignore",
    env: {
      ...process.env,
      XIAOBU_CODEX_BIN: fakeCodex,
      XIAOBU_CODEX_CONTROL_STATE: control,
      XIAOBU_OPENPETS_THREAD_STATE: threadState,
      XIAOBU_OPENPETS_CLI: fakeCli,
      XIAOBU_CODEX_BRIDGE_PORT: String(port),
      XIAOBU_CODEX_DISABLE_ACTIVATE: "1",
      CODEX_FIXTURE: fixture,
      FAKE_CLI_LOG: cliLog,
    },
  });
  let child = launch();
  context.after(() => child.kill("SIGKILL"));

  await waitFor(`http://127.0.0.1:${port}/tasks`, (value) => value.tasks?.[0]?.state === "推进中");
  await waitForCalls(cliLog, (calls) => calls.some((args) => args[0] === "notify" && args.includes("running") && args.includes(taskId)));
  await appendFile(rollout, JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } }) + "\n");
  await waitFor(`http://127.0.0.1:${port}/tasks`, (value) => value.tasks?.[0]?.state === "已完成");
  let calls = await waitForCalls(cliLog, (items) => items.some((args) => args[0] === "notify" && args.includes("done") && args.includes(taskId)));
  assert.ok(!calls.some((args) => args[0] === "clear" && args.includes(taskId)));

  const opened = await fetch(`http://127.0.0.1:${port}/open-task?task=${taskId}`);
  assert.equal(opened.status, 200);
  assert.match(await opened.text(), /window\.close/);
  await sleep(500);
  calls = (await readFile(cliLog, "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(calls.some((args) => args[0] === "clear" && args.includes(taskId)));

  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));
  const callsBeforeRestart = calls.length;
  child = launch();
  await waitFor(`http://127.0.0.1:${port}/tasks`, (value) => value.tasks?.[0]?.state === "已完成");
  await sleep(3500);
  const callsAfterRestart = (await readFile(cliLog, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(callsAfterRestart.length, callsBeforeRestart);
});
