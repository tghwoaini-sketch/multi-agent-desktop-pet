import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PORT = Number(process.env.XIAOBU_CODEX_BRIDGE_PORT || 43127);
const CODEX_BIN = process.env.XIAOBU_CODEX_BIN || [
  join(homedir(), ".local", "bin", "codex"),
  "/Applications/ChatGPT.app/Contents/Resources/codex",
].find(existsSync) || "codex";
const REFRESH_MS = 3000;
const MAX_TASKS = 40;
const PET_TASK_LIMIT = 5;
const OPENPETS_CLI = process.env.XIAOBU_OPENPETS_CLI || "/Applications/OpenPets.app/Contents/MacOS/openpets-cli";
const OPENPETS_THREAD_STATE = process.env.XIAOBU_OPENPETS_THREAD_STATE || join(homedir(), ".config", "openpets", "xiaobu-codex-threads.json");

let codex = null;
let requestId = 0;
let initialized = false;
let paused = process.env.XIAOBU_CODEX_BRIDGE_START_PAUSED === "1";
let restartTimer = null;
let refreshTimer = null;
let frontmostTimer = null;
let lastFrontmostApp = "";
const pending = new Map();
const rolloutCache = new Map();
const openPetsThreads = new Map();
const openPetsSignatures = new Map();
const acknowledgedSignatures = new Map();
const completedSignatures = new Map();
let refreshInFlight = false;
let snapshot = {
  connected: false,
  tasks: [],
  syncedAt: null,
  error: "正在连接 Codex…",
};

function loadOpenPetsThreads() {
  try {
    const saved = JSON.parse(readFileSync(OPENPETS_THREAD_STATE, "utf8"));
    if (!saved || typeof saved !== "object") return;
    for (const [taskId, threadId] of Object.entries(saved)) {
      if (typeof taskId === "string" && typeof threadId === "string" && threadId) openPetsThreads.set(taskId, threadId);
    }
  } catch {
    // A missing or partially written state file is equivalent to a clean start.
  }
}

function saveOpenPetsThreads() {
  try {
    mkdirSync(dirname(OPENPETS_THREAD_STATE), { recursive: true });
    writeFileSync(OPENPETS_THREAD_STATE, `${JSON.stringify(Object.fromEntries(openPetsThreads))}\n`);
  } catch {
    // The bridge can still operate without persistence if the config directory is unavailable.
  }
}

loadOpenPetsThreads();

function send(method, params) {
  if (!codex?.stdin?.writable) return Promise.reject(new Error("Codex 连接尚未就绪"));
  const id = ++requestId;
  codex.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} 响应超时`));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
  });
}

function statusKind(status) {
  if (typeof status === "string") return status;
  if (status && typeof status === "object" && typeof status.type === "string") return status.type;
  if (status && typeof status === "object") return Object.keys(status)[0] || "notLoaded";
  return "notLoaded";
}

function activeFlags(status) {
  if (!status || typeof status !== "object") return {};
  if (status.type === "active") return status;
  return status.active && typeof status.active === "object" ? status.active : status;
}

function cleanText(value, fallback) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, 180);
}

function rolloutSignal(path) {
  try {
    const fileStat = statSync(path);
    const cached = rolloutCache.get(path);
    if (cached && cached.size === fileStat.size && cached.mtimeMs === fileStat.mtimeMs) return cached.signal;
    const bytesToRead = Math.min(160000, fileStat.size);
    const start = Math.max(0, fileStat.size - bytesToRead);
    const descriptor = openSync(path, "r");
    const buffer = Buffer.alloc(bytesToRead);
    readSync(descriptor, buffer, 0, bytesToRead, start);
    closeSync(descriptor);
    const tail = buffer.toString("utf8");
    let latest = null;
    let activityAfterTerminal = false;
    const pendingCalls = new Set();
    for (const line of tail.split("\n")) {
      try {
        const item = JSON.parse(line);
        const itemType = item.type === "event_msg" ? item.payload?.type : item.payload?.type || item.item?.type;
        if (item.type === "response_item") {
          const callId = item.payload?.call_id;
          if (callId && ["function_call", "custom_tool_call"].includes(itemType)) pendingCalls.add(callId);
          if (callId && ["function_call_output", "custom_tool_call_output"].includes(itemType)) pendingCalls.delete(callId);
        }
        if (item.type === "event_msg" && ["task_started", "task_complete", "turn_aborted"].includes(itemType)) {
          latest = item.payload;
          activityAfterTerminal = false;
        } else if (latest && ["agent_reasoning", "function_call", "custom_tool_call", "reasoning"].includes(itemType)) {
          activityAfterTerminal = true;
        }
      } catch {
        // A partially written JSONL line is ignored until the next refresh.
      }
    }
    if (!latest && pendingCalls.size > 0) latest = { type: "task_started" };
    else if (latest?.type === "task_complete" && !activityAfterTerminal && pendingCalls.size === 0) return { kind: "completed", note: "本轮已完成，等待下一条指令" };
    else if (pendingCalls.size > 0 || activityAfterTerminal) latest = { type: "task_started" };
    if (!latest) {
      rolloutCache.set(path, { size: fileStat.size, mtimeMs: fileStat.mtimeMs, signal: null });
      return null;
    }
    let signal;
    if (latest.type === "task_started") signal = { kind: "active", note: "检测到 Codex 正在执行" };
    else if (latest.type === "turn_aborted") signal = { kind: "systemError", note: "Codex 任务被中止" };
    else if (latest.error) {
      const message = typeof latest.error === "string" ? latest.error : latest.error.message;
      signal = { kind: "systemError", note: `Codex 任务失败：${cleanText(message, "请检查任务设置")}` };
    } else signal = { kind: "completed", note: "本轮已完成，等待下一条指令" };
    rolloutCache.set(path, { size: fileStat.size, mtimeMs: fileStat.mtimeMs, signal });
    return signal;
  } catch {
    return null;
  }
}

function normalizeThread(thread) {
  let kind = statusKind(thread.status);
  const flags = activeFlags(thread.status);
  const updatedSeconds = thread.recencyAt || thread.updatedAt || thread.createdAt;
  const updatedAt = new Date(updatedSeconds * 1000).toISOString();
  const title = cleanText(thread.name, cleanText(thread.preview, "未命名 Codex 任务")).slice(0, 58);
  try {
    // Codex reports a completed turn as `idle` once the thread is ready for
    // another instruction. Read the rollout for both idle and notLoaded so
    // that "ready to continue" is not mistaken for "still waiting".
    if (["idle", "notLoaded"].includes(kind) && typeof thread.path === "string") {
      const signal = rolloutSignal(thread.path);
      if (signal?.kind === "systemError") kind = "systemError";
      else if (signal?.kind === "active") kind = "active";
      else if (signal?.kind === "completed") kind = "completed";
      else if (signal?.kind === "idle") kind = "idle";
      if (signal?.note) thread = { ...thread, __rolloutNote: signal.note };
    }
  } catch {
    // Some stored tasks do not expose a readable rollout path. Their saved status is still useful.
  }
  let state = "等待中";
  let stateNote = "任务已保存，可随时继续";
  if (kind === "active") {
    state = flags.waitingOnApproval || flags.waitingOnUserInput ? "需要介入" : "推进中";
    stateNote = flags.waitingOnApproval ? "等待你批准操作" : flags.waitingOnUserInput ? "等待你补充信息" : "检测到 Codex 正在执行";
  } else if (kind === "systemError") {
    state = "已阻塞";
    stateNote = thread.__rolloutNote || "Codex 任务出现运行错误";
  } else if (kind === "idle") {
    stateNote = "本轮已结束，等待下一条指令";
  } else if (kind === "completed") {
    state = "已完成";
    stateNote = "本轮已完成，等待下一条指令";
  }
  return {
    id: thread.id,
    title,
    summary: cleanText(thread.preview, "暂无任务摘要"),
    state,
    stateNote,
    runtimeStatus: kind,
    updatedAt,
    cwd: typeof thread.cwd === "string" ? thread.cwd : "",
    canAcceptInput: thread.canAcceptDirectInput === true,
  };
}

function openPetsStatus(task) {
  if (task.state === "推进中") return "running";
  if (task.state === "需要介入") return "review";
  if (task.state === "已阻塞") return "failed";
  if (task.state === "已完成") return "done";
  return "waiting";
}

function codexTargetUrl(task) {
  return task.id ? `codex://threads/${encodeURIComponent(task.id)}` : "";
}

function activateCodexDesktop() {
  if (process.platform !== "darwin") return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile("osascript", ["-e", 'tell application "ChatGPT" to activate'], { timeout: 3000 }, (error) => resolve(!error));
  });
}

function runOpenPets(args) {
  if (!existsSync(OPENPETS_CLI)) return Promise.resolve("");
  return new Promise((resolve) => {
    const child = spawn(OPENPETS_CLI, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.on("error", () => resolve(""));
    child.on("close", (code) => resolve(code === 0 ? output.trim() : ""));
  });
}

async function relayTaskToOpenPets(task) {
  const signature = JSON.stringify([task.state, task.title, task.summary, task.stateNote, task.updatedAt]);
  if (acknowledgedSignatures.get(task.id) === signature) return;

  if (task.state === "已完成") {
    if (completedSignatures.get(task.id) !== signature) {
      const threadId = openPetsThreads.get(task.id);
      openPetsThreads.delete(task.id);
      saveOpenPetsThreads();
      openPetsSignatures.set(task.id, signature);
      completedSignatures.set(task.id, signature);
      if (threadId) await runOpenPets(["clear", "--thread", threadId]);
    }
    return;
  }

  if (openPetsSignatures.get(task.id) === signature) return;
  const openTaskUrl = codexTargetUrl(task);
  const args = ["notify", "--title", `Codex · ${task.title}`, "--status", openPetsStatus(task), "--text", cleanText(task.stateNote, task.summary), "--url", openTaskUrl, "--button", "打开任务"];
  const threadId = openPetsThreads.get(task.id);
  if (threadId) args.push("--thread", threadId);
  const output = await runOpenPets(args);
  if (!output) return;
  if (!threadId) {
    const candidate = output.split(/\s+/).filter(Boolean).at(-1);
    if (candidate) {
      openPetsThreads.set(task.id, candidate);
      saveOpenPetsThreads();
    }
  }
  openPetsSignatures.set(task.id, signature);
}

async function acknowledgeTask(taskId) {
  const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return null;
  const signature = JSON.stringify([task.state, task.title, task.summary, task.stateNote, task.updatedAt]);
  acknowledgedSignatures.set(task.id, signature);
  const threadId = openPetsThreads.get(task.id);
  openPetsThreads.delete(task.id);
  saveOpenPetsThreads();
  openPetsSignatures.delete(task.id);
  if (threadId) await runOpenPets(["clear", "--thread", threadId]);
  return codexTargetUrl(task);
}

async function relayCodexTasksToOpenPets(tasks) {
  const selected = tasks.slice(0, PET_TASK_LIMIT);
  await Promise.all(selected.map((task) => relayTaskToOpenPets(task)));
}

function refreshOpenPetsLayerForCodex() {
  if (process.platform !== "darwin") return;
  execFile("osascript", ["-e", 'tell application "System Events" to get name of first process whose frontmost is true'], { timeout: 1500 }, (error, stdout) => {
    if (error) return;
    const appName = String(stdout).trim();
    if (!appName || appName === lastFrontmostApp) return;
    lastFrontmostApp = appName;
    if (appName === "ChatGPT" || appName === "Codex") {
      // Re-notifying the existing threads calls orderFrontRegardless() in OpenPets,
      // bringing the message panel above the Codex page without creating new tasks.
      openPetsSignatures.clear();
      void relayCodexTasksToOpenPets(snapshot.tasks);
    }
  });
}

async function clearCodexOpenPetsThreads() {
  const threadIds = [...openPetsThreads.values()];
  openPetsThreads.clear();
  openPetsSignatures.clear();
  saveOpenPetsThreads();
  await Promise.all(threadIds.map((threadId) => runOpenPets(["clear", "--thread", threadId])));
}

async function refreshThreads() {
  if (!initialized || refreshInFlight) return;
  refreshInFlight = true;
  try {
    const result = await send("thread/list", {
      limit: MAX_TASKS,
      archived: false,
      sortKey: "recency_at",
      sortDirection: "desc",
      useStateDbOnly: false,
    });
    snapshot = {
      connected: true,
      tasks: Array.isArray(result?.data) ? result.data.map(normalizeThread) : [],
      syncedAt: new Date().toISOString(),
      error: null,
    };
    void relayCodexTasksToOpenPets(snapshot.tasks);
  } catch (error) {
    snapshot = { ...snapshot, connected: false, error: error instanceof Error ? error.message : "Codex 刷新失败" };
  } finally {
    refreshInFlight = false;
  }
}

function scheduleRestart(message) {
  initialized = false;
  clearInterval(refreshTimer);
  refreshTimer = null;
  snapshot = { ...snapshot, connected: false, error: paused ? "实时连接已暂停" : message };
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(new Error(message));
  }
  pending.clear();
  if (!paused && !restartTimer) {
    restartTimer = setTimeout(() => {
      restartTimer = null;
      startCodex();
    }, 3000);
  }
}

function startCodex() {
  if (paused || (codex && !codex.killed)) return;
  codex = spawn(CODEX_BIN, ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  const lines = createInterface({ input: codex.stdout });
  lines.on("line", async (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      clearTimeout(entry.timer);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message || "Codex 请求失败"));
      else entry.resolve(message.result);
      return;
    }
    if (typeof message.method === "string" && /^(thread|turn)\//.test(message.method)) {
      void refreshThreads();
    }
  });
  codex.stderr.on("data", (chunk) => {
    const message = String(chunk).trim();
    if (message) process.stderr.write(`[codex bridge] ${message}\n`);
  });
  codex.on("error", (error) => scheduleRestart(`无法启动 Codex：${error.message}`));
  codex.on("exit", () => scheduleRestart("Codex 连接已断开，正在重连…"));

  send("initialize", { clientInfo: { name: "xiaobu-task-desk", version: "0.1.0" } })
    .then(() => {
      if (paused || !codex || codex.killed) return;
      codex.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
      initialized = true;
      void refreshThreads();
      refreshTimer = setInterval(refreshThreads, REFRESH_MS);
    })
    .catch((error) => scheduleRestart(error.message));
}

function setPaused(value) {
  paused = value;
  clearInterval(refreshTimer);
  refreshTimer = null;
  if (paused) {
    initialized = false;
    snapshot = { ...snapshot, connected: false, error: "实时连接已暂停" };
    if (codex && !codex.killed) codex.kill("SIGTERM");
    codex = null;
    void clearCodexOpenPetsThreads();
  } else if (!codex || codex.killed) {
    startCodex();
  }
  return paused;
}

const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/tasks") {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.writeHead(200).end(JSON.stringify(snapshot));
    return;
  }
  if (request.url?.startsWith("/open-task?")) {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    const taskId = url.searchParams.get("task");
    if (!taskId) {
      response.writeHead(400).end("Missing task");
      return;
    }
    void acknowledgeTask(taskId).then(async (targetUrl) => {
      if (!targetUrl) {
        response.writeHead(404).end("Task not found");
        return;
      }
      if (await activateCodexDesktop()) {
        response.writeHead(204).end();
        return;
      }
      response.writeHead(302, { Location: `http://localhost:3001/work?task=${encodeURIComponent(taskId)}` }).end();
    });
    return;
  }
  if (request.url === "/control" && request.method === "GET") {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.writeHead(200).end(JSON.stringify({ paused }));
    return;
  }
  if (request.url === "/control" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const payload = JSON.parse(body);
        if (typeof payload.enabled !== "boolean") throw new Error("enabled must be boolean");
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.writeHead(200).end(JSON.stringify({ ok: true, paused: setPaused(!payload.enabled) }));
      } catch (error) {
        response.writeHead(400).end(error instanceof Error ? error.message : "invalid control request");
      }
    });
    return;
  }
  response.writeHead(404).end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`Codex task bridge: http://127.0.0.1:${PORT}/tasks\n`);
  startCodex();
  refreshOpenPetsLayerForCodex();
  frontmostTimer = setInterval(refreshOpenPetsLayerForCodex, 3000);
});

async function shutdown() {
  clearInterval(refreshTimer);
  clearInterval(frontmostTimer);
  clearTimeout(restartTimer);
  if (codex && !codex.killed) codex.kill("SIGTERM");
  await clearCodexOpenPetsThreads();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
