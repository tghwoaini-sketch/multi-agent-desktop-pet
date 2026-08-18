import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

const PORT = Number(process.env.XIAOBU_QODERCN_BRIDGE_PORT || 43129);
const REFRESH_MS = 3000;
const MAX_TASKS = 5;
const FRESH_MS = 15 * 60_000;
const DB = process.env.XIAOBU_QODERCN_DB || `${homedir()}/Library/Application Support/QoderCN/SharedClientCache/cache/db/local.db`;
const QODER_LOG_FILE = process.env.XIAOBU_QODERCN_LOG || `${homedir()}/Library/Application Support/QoderCN/SharedClientCache/logs/qoder.log`;
const SQLITE = process.env.XIAOBU_QODER_SQLITE_BIN || "/usr/bin/sqlite3";
const OPENPETS_CLI = process.env.XIAOBU_OPENPETS_CLI || "/Applications/OpenPets.app/Contents/MacOS/openpets-cli";
const CONTROL_STATE_FILE = process.env.XIAOBU_CODEX_CONTROL_STATE || `${homedir()}/.config/openpets/xiaobu-codex-control.json`;
const DISPLAY_STATE_FILE = process.env.XIAOBU_QODERCN_DISPLAY_STATE || `${homedir()}/.config/openpets/xiaobu-qodercn-threads.json`;

let paused = true;
let refreshInFlight = false;
let snapshot = { connected: false, paused: true, tasks: [], syncedAt: null, error: "正在连接 Qoder CN…" };
const displayed = new Set();
const mountedStates = new Map();
const previousStates = new Map();
const signatures = new Map();
const acknowledged = new Map();
const relayPromises = new Map();
const runtimeSignals = new Map();

function cleanText(value, fallback = "") {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, 180);
}

function loadState() {
  try {
    const saved = JSON.parse(readFileSync(DISPLAY_STATE_FILE, "utf8"));
    for (const id of saved?.threads || []) if (typeof id === "string") displayed.add(id);
    for (const [id, state] of Object.entries(saved?.states || {})) if (typeof state === "string") mountedStates.set(id, state);
    for (const [id, state] of Object.entries(saved?.previousStates || {})) if (typeof state === "string") previousStates.set(id, state);
    for (const [id, signature] of Object.entries(saved?.acknowledged || {})) if (typeof signature === "string") acknowledged.set(id, signature);
  } catch {
    // A fresh bridge starts without historical Qoder bubbles.
  }
}

function saveState() {
  try {
    mkdirSync(dirname(DISPLAY_STATE_FILE), { recursive: true });
    writeFileSync(DISPLAY_STATE_FILE, `${JSON.stringify({
      threads: [...displayed],
      states: Object.fromEntries(mountedStates),
      previousStates: Object.fromEntries(previousStates),
      acknowledged: Object.fromEntries(acknowledged),
    })}\n`);
  } catch {
    // The bridge remains usable if its small recovery file cannot be saved.
  }
}

function isPaused() {
  try { return JSON.parse(readFileSync(CONTROL_STATE_FILE, "utf8"))?.paused !== false; } catch { return true; }
}

function readRecentLogLines() {
  if (!existsSync(QODER_LOG_FILE)) return [];
  try {
    const size = statSync(QODER_LOG_FILE).size;
    const start = Math.max(0, size - 4 * 1024 * 1024);
    const descriptor = openSync(QODER_LOG_FILE, "r");
    const buffer = Buffer.alloc(size - start);
    try { readSync(descriptor, buffer, 0, buffer.length, start); } finally { closeSync(descriptor); }
    return buffer.toString("utf8").split("\n").slice(start > 0 ? 1 : 0);
  } catch { return []; }
}

function refreshRuntimeSignals() {
  const cutoff = Date.now() - FRESH_MS;
  for (const line of readRecentLogLines()) {
    if (!line.includes("broadcastTaskStatus")) continue;
    const timestamp = line.match(/^(\S+)/)?.[1];
    const eventAt = timestamp ? Date.parse(timestamp) : NaN;
    if (!Number.isFinite(eventAt) || eventAt < cutoff) continue;
    const jsonStart = line.indexOf("{", line.indexOf("broadcastTaskStatus"));
    if (jsonStart < 0) continue;
    try {
      const payload = JSON.parse(line.slice(jsonStart));
      const sessionId = payload.sessionId;
      const status = String(payload.status || "");
      if (sessionId && status) runtimeSignals.set(sessionId, { status, at: eventAt });
    } catch { /* A partial log line is ignored until the next refresh. */ }
  }
  for (const [id, signal] of runtimeSignals) if (signal.at < cutoff) runtimeSignals.delete(id);
}

function runSqlite(query) {
  return new Promise((resolve, reject) => {
    if (!existsSync(DB) || !existsSync(SQLITE)) return reject(new Error("Qoder CN 本地数据库不可用"));
    execFile(SQLITE, ["-readonly", "-json", DB, query], { timeout: 5000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(error);
      try { resolve(JSON.parse(stdout || "[]")); } catch { reject(new Error("Qoder CN 状态数据格式无效")); }
    });
  });
}

function rowState(row) {
  const status = String(row.status || "").toLowerCase();
  const stopReason = String(row.stop_reason || "").toLowerCase();
  // Qoder keeps the previous stop reason after a session resumes. The current
  // session status is therefore authoritative whenever it says Running.
  if (status === "running") return "active";
  if (["failed", "error", "aborted", "cancelled", "canceled"].some((value) => status.includes(value) || stopReason.includes(value))) return "failed";
  if (["waiting", "need_input", "needs_input", "pending", "review"].some((value) => status.includes(value) || stopReason.includes(value))) return "review";
  return "completed";
}

function taskSignature(task) { return JSON.stringify([task.state, task.title, task.note, task.updatedAt]); }

async function readTasks() {
  const rows = await runSqlite(`SELECT session_id, session_title, project_name, status, stop_reason,
    MAX(COALESCE(gmt_modified, 0), COALESCE(last_user_query_at, 0)) AS updated_at
    FROM chat_session
    WHERE session_id LIKE 'task-%' AND session_type != 'agent_sub'
    ORDER BY updated_at DESC LIMIT 100;`);
  const now = Date.now();
  return rows.map((row) => {
    const updatedMs = Number(row.updated_at || 0);
    const runtime = runtimeSignals.get(row.session_id);
    const rawState = runtime?.status === "Running" ? "active" : runtime?.status === "Completed" ? "completed" : rowState(row);
    const state = rawState === "active" && now - updatedMs > FRESH_MS ? "stale" : rawState;
    const title = cleanText(row.session_title, "未命名 Qoder CN 任务");
    return {
      id: row.session_id,
      title: title.slice(0, 58),
      summary: cleanText(row.project_name, "Qoder CN 工作区"),
      workspace: cleanText(row.project_name, "Qoder CN 工作区"),
      state,
      note: state === "active" ? "Qoder CN 正在执行" : state === "review" ? "等待你的确认或补充信息" : state === "failed" ? "Qoder CN 任务异常中止" : "本轮已完成",
      updatedAt: new Date(updatedMs || now).toISOString(),
    };
  }).filter((task) => task.state !== "stale");
}

function openPetsStatus(state) {
  if (state === "active") return "running";
  if (state === "review") return "review";
  if (state === "failed") return "failed";
  return "done";
}

function runOpenPets(args) {
  if (!existsSync(OPENPETS_CLI)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn(OPENPETS_CLI, args, { stdio: ["ignore", "ignore", "ignore"] });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function clearTask(id) {
  await runOpenPets(["clear", "--thread", id]);
  displayed.delete(id); mountedStates.delete(id); signatures.delete(id); saveState();
}

async function relayTask(task) {
  const signature = taskSignature(task);
  if (acknowledged.get(task.id) === signature || signatures.get(task.id) === signature) return;
  if (relayPromises.has(task.id)) return relayPromises.get(task.id);
  const relay = (async () => {
    const completed = task.state === "completed";
    const needsUser = task.state === "review";
    const ok = await runOpenPets([
      "notify", "--title", `Qoder CN · ${needsUser ? "需要你 · " : ""}${task.title}`,
      "--status", openPetsStatus(task.state),
      "--text", completed ? "任务已完成，点击查看并收起" : needsUser ? `需要你的回复才能继续 · ${task.note}` : task.note,
      "--thread", task.id, "--url", `xiaobu-task://qodercn?task=${encodeURIComponent(task.id)}`,
      "--button", completed ? "查看并收起" : needsUser ? "回复 Qoder CN" : "打开 Qoder CN",
    ]);
    if (!ok) return;
    displayed.add(task.id); mountedStates.set(task.id, task.state); signatures.set(task.id, signature); saveState();
  })();
  relayPromises.set(task.id, relay);
  try { await relay; } finally { relayPromises.delete(task.id); }
}

function activateQoder() {
  if (process.env.XIAOBU_QODERCN_DISABLE_ACTIVATE === "1" || process.platform !== "darwin") return Promise.resolve(false);
  return new Promise((resolve) => execFile("open", ["-a", "Qoder CN"], { timeout: 3000 }, (error) => resolve(!error)));
}

function closeLauncherPage(response) {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.writeHead(200).end("<!doctype html><meta charset=utf-8><title>正在打开 Qoder CN</title><script>window.close();setTimeout(()=>location.replace('about:blank'),120);</script>");
}

async function acknowledgeTask(taskId) {
  const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return false;
  if (task.state === "completed" || task.state === "failed") {
    acknowledged.set(task.id, taskSignature(task));
    await clearTask(task.id);
  }
  await activateQoder();
  return true;
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    paused = isPaused();
    if (paused) {
      await Promise.all([...displayed].map(clearTask));
      snapshot = { connected: false, paused: true, tasks: [], syncedAt: new Date().toISOString(), error: "实时连接已暂停" };
      return;
    }
    refreshRuntimeSignals();
    const tasks = await readTasks();
    const candidates = [];
    for (const task of tasks) {
      const previous = previousStates.get(task.id);
      const shouldMountTerminal = ["completed", "failed"].includes(task.state)
        && acknowledged.get(task.id) !== taskSignature(task)
        && (["active", "review"].includes(mountedStates.get(task.id)) || ["active", "review"].includes(previous));
      if (["active", "review"].includes(task.state) || shouldMountTerminal) candidates.push(task);
      previousStates.set(task.id, task.state);
    }
    const selected = candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_TASKS);
    const selectedIds = new Set(selected.map((task) => task.id));
    await Promise.all([
      ...selected.map(relayTask),
      ...[...displayed].filter((id) => !selectedIds.has(id)).map(clearTask),
    ]);
    saveState();
    snapshot = { connected: true, paused: false, tasks: selected, syncedAt: new Date().toISOString(), error: null };
  } catch (error) {
    snapshot = { ...snapshot, connected: false, error: error instanceof Error ? error.message : "Qoder CN 刷新失败" };
  } finally { refreshInFlight = false; }
}

loadState();
const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/tasks") {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.writeHead(200).end(JSON.stringify(snapshot));
    return;
  }
  if (request.url?.startsWith("/open-task?")) {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    const taskId = url.searchParams.get("task");
    void acknowledgeTask(taskId).then((found) => found ? closeLauncherPage(response) : response.writeHead(404).end("Task not found"));
    return;
  }
  response.writeHead(404).end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`Qoder CN task bridge: http://127.0.0.1:${PORT}/tasks\n`);
  void refresh();
  setInterval(refresh, REFRESH_MS);
});

function shutdown() { server.close(() => process.exit(0)); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
