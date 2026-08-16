import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

const PORT = Number(process.env.XIAOBU_WORKBUDDY_BRIDGE_PORT || 43128);
const REFRESH_MS = 3000;
const INDEX_REFRESH_MS = 60_000;
const MAX_TASKS = 5;
const STALE_ACTIVE_MS = 15 * 60_000;
const FAILED_VISIBLE_MS = 60 * 60_000;
const MAX_TAIL_BYTES = 8 * 1024 * 1024;
const WORKBUDDY_ROOT = process.env.XIAOBU_WORKBUDDY_ROOT || join(homedir(), ".workbuddy");
const PROJECTS_ROOT = join(WORKBUDDY_ROOT, "projects");
const SESSIONS_FILE = join(WORKBUDDY_ROOT, "app", "sessions.json");
const OPENPETS_CLI = process.env.XIAOBU_OPENPETS_CLI || "/Applications/OpenPets.app/Contents/MacOS/openpets-cli";
const CONTROL_STATE_FILE = process.env.XIAOBU_CODEX_CONTROL_STATE || join(homedir(), ".config", "openpets", "xiaobu-codex-control.json");
const DISPLAY_STATE_FILE = process.env.XIAOBU_WORKBUDDY_DISPLAY_STATE || join(homedir(), ".config", "openpets", "xiaobu-workbuddy-threads.json");

let fileIndex = new Map();
let lastIndexAt = 0;
let refreshInFlight = false;
const signatures = new Map();
const relayPromises = new Map();
const displayed = new Set();
// Keep the lifecycle alongside the mounted ID. Legacy files only have IDs;
// without this distinction, completed historical sessions can reappear after
// a bridge restart.
const mountedStates = new Map();
const acknowledged = new Map();
const previousStates = new Map();
let snapshot = { connected: false, paused: true, tasks: [], syncedAt: null, error: "正在连接 WorkBuddy…" };

function cleanText(value, fallback = "") {
  const text = typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, 180);
}

function loadDisplayed() {
  try {
    const saved = JSON.parse(readFileSync(DISPLAY_STATE_FILE, "utf8"));
    for (const id of saved?.threads || []) if (typeof id === "string") displayed.add(id);
    for (const [id, state] of Object.entries(saved?.states || {})) if (typeof state === "string") mountedStates.set(id, state);
    for (const [id, signature] of Object.entries(saved?.acknowledged || {})) if (typeof signature === "string") acknowledged.set(id, signature);
    for (const [id, state] of Object.entries(saved?.previousStates || {})) if (typeof state === "string") previousStates.set(id, state);
  } catch {
    // A fresh bridge starts with no owned bubbles.
  }
}

function saveDisplayed() {
  try {
    mkdirSync(dirname(DISPLAY_STATE_FILE), { recursive: true });
    writeFileSync(DISPLAY_STATE_FILE, `${JSON.stringify({
      threads: [...displayed],
      states: Object.fromEntries(mountedStates),
      acknowledged: Object.fromEntries(acknowledged),
      previousStates: Object.fromEntries(previousStates),
    })}\n`);
  } catch {
    // OpenPets still works if the small recovery file cannot be saved.
  }
}

function isPaused() {
  try {
    return JSON.parse(readFileSync(CONTROL_STATE_FILE, "utf8"))?.paused !== false;
  } catch {
    return true;
  }
}

function buildFileIndex() {
  const next = new Map();
  const stack = [PROJECTS_ROOT];
  while (stack.length) {
    const directory = stack.pop();
    let entries = [];
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) next.set(entry.name.slice(0, -6), path);
    }
  }
  fileIndex = next;
  lastIndexAt = Date.now();
}

function readTail(path) {
  const size = statSync(path).size;
  const start = Math.max(0, size - MAX_TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  const descriptor = openSync(path, "r");
  try { readSync(descriptor, buffer, 0, buffer.length, start); } finally { closeSync(descriptor); }
  return buffer.toString("utf8").split("\n").slice(start > 0 ? 1 : 0);
}

function contentText(item) {
  if (typeof item?.content === "string") return item.content;
  if (Array.isArray(item?.content)) return item.content.map((part) => part?.text || "").join(" ");
  if (typeof item?.message === "string") return item.message;
  if (item?.message && typeof item.message.content === "string") return item.message.content;
  return "";
}

function queriesFrom(text) {
  if (!text) return [];
  return [...text.matchAll(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/g)].map((match) => {
    const withoutAttachments = match[1]
      .replace(/@(?:image|file)#\d+:(?:"[^"]+"|[^\s,，。]+?\.(?:png|jpe?g|gif|webp|heic|svg|pdf|docx?|xlsx?|pptx?|txt|md))/gi, " ")
      .replace(/@(?:image|file)#\d+:[^\s,，。]+/gi, " ")
      .replace(/(?:Clipboard[_ -]?Screenshot|codex-clipboard)[^\s,，。]*/gi, " ")
      .replace(/<system-reminder[\s\S]*?<\/system-reminder>/gi, " ")
      .replace(/^[\s,，。:：;；—-]+/, "");
    return cleanText(withoutAttachments);
  }).filter(Boolean);
}

function usefulQuery(queries) {
  const generic = /^(?:执行|继续|开始|可以|好|好的|行|是|确认)$/i;
  return [...queries].reverse().find((query) => query.length >= 6 && !generic.test(query)) || queries.at(-1) || "当前任务";
}

function analyzeSession(session, path) {
  const calls = new Map();
  const queries = [];
  let lifecycle = "completed";
  let note = "本轮已完成";
  let lastEventAt = statSync(path).mtimeMs;
  let latestAssistant = "";

  for (const line of readTail(path)) {
    let item;
    try { item = JSON.parse(line); } catch { continue; }
    if (Number.isFinite(item.timestamp)) lastEventAt = Math.max(lastEventAt, item.timestamp);
    const text = contentText(item);
    queries.push(...queriesFrom(text));

    if (item.type === "message" && item.role === "user") {
      lifecycle = "active";
      note = "WorkBuddy 正在处理";
      continue;
    }
    if (item.type === "reasoning") {
      lifecycle = "active";
      note = "WorkBuddy 正在思考";
      continue;
    }
    if (item.type === "function_call") {
      if (item.callId) calls.set(item.callId, item.name || "");
      lifecycle = isUserPromptTool(item.name) ? "review" : "active";
      note = lifecycle === "review" ? "等待你确认或补充信息" : `正在执行${item.name ? `：${item.name}` : "工具"}`;
      continue;
    }
    if (item.type === "function_call_result") {
      const callName = calls.get(item.callId);
      lifecycle = "active";
      note = isUserPromptTool(callName) ? "已收到你的回复，正在继续" : "工具执行完成，正在整理结果";
      continue;
    }
    if (item.type === "message" && item.role === "assistant") {
      latestAssistant = cleanText(text, latestAssistant);
      if (item.status === "incomplete") {
        lifecycle = "failed";
        note = latestAssistant || "WorkBuddy 任务异常中止";
      } else if (item.status === "completed" && (Object.hasOwn(item, "message") || item.providerData?.rawUsage)) {
        lifecycle = "completed";
        note = "本轮已完成";
      } else {
        lifecycle = "active";
        note = latestAssistant || "WorkBuddy 正在处理";
      }
    }
  }

  const age = Date.now() - lastEventAt;
  if (["active", "review"].includes(lifecycle) && age > STALE_ACTIVE_MS) lifecycle = "stale";
  if (lifecycle === "failed" && age > FAILED_VISIBLE_MS) lifecycle = "stale";
  const workspace = basename(session.workDir || dirname(path));
  const query = usefulQuery(queries);
  return {
    id: session.conversationId,
    title: cleanText(query === "当前任务" ? workspace : query, workspace).slice(0, 34),
    workspace,
    state: lifecycle,
    note: cleanText(note, "WorkBuddy 正在处理"),
    updatedAt: new Date(lastEventAt).toISOString(),
  };
}

function isUserPromptTool(name) {
  const normalized = String(name || "").toLowerCase().replace(/[^a-z]/g, "");
  return [
    "askuserquestion", "askuser", "requestuserinput", "requestinput",
    "needuserinput", "permissionrequest", "requestpermission", "confirmaction",
  ].includes(normalized);
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
  displayed.delete(id);
  mountedStates.delete(id);
  signatures.delete(id);
  saveDisplayed();
}

function openPetsStatus(state) {
  if (state === "active") return "running";
  if (state === "review") return "review";
  if (state === "failed") return "failed";
  if (state === "completed") return "done";
  return "waiting";
}

function taskSignature(task) {
  return JSON.stringify([task.state, task.title, task.note]);
}

async function relayTask(task) {
  const signature = taskSignature(task);
  const needsUser = task.state === "review";
  if (acknowledged.get(task.id) === signature) return;
  if (signatures.get(task.id) === signature || relayPromises.has(task.id)) return relayPromises.get(task.id);
  const relay = (async () => {
    const ok = await runOpenPets([
      "notify", "--title", `WorkBuddy · ${needsUser ? "需要你 · " : ""}${task.title}`, "--status", openPetsStatus(task.state),
      "--text", task.state === "completed" ? "任务已完成，点击查看并收起" : needsUser ? `需要你的回复才能继续 · ${task.note}` : task.note,
      "--thread", task.id, "--url", `xiaobu-task://workbuddy?task=${encodeURIComponent(task.id)}`,
      "--button", task.state === "completed" ? "查看并收起" : needsUser ? "回复 WorkBuddy" : "打开 WorkBuddy",
    ]);
    if (!ok) return;
    displayed.add(task.id);
    mountedStates.set(task.id, task.state);
    signatures.set(task.id, signature);
    saveDisplayed();
  })();
  relayPromises.set(task.id, relay);
  try { await relay; } finally { relayPromises.delete(task.id); }
}

function activateWorkBuddy() {
  if (process.env.XIAOBU_WORKBUDDY_DISABLE_ACTIVATE === "1" || process.platform !== "darwin") return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile("open", ["-a", "WorkBuddy"], { timeout: 3000 }, (error) => resolve(!error));
  });
}

async function acknowledgeTask(taskId) {
  const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return false;
  if (task.state === "completed") {
    acknowledged.set(task.id, taskSignature(task));
    await clearTask(task.id);
    saveDisplayed();
  }
  await activateWorkBuddy();
  return true;
}

function closeLauncherPage(response) {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.writeHead(200).end("<!doctype html><meta charset=utf-8><title>正在打开 WorkBuddy</title><script>window.close();setTimeout(()=>location.replace('about:blank'),120);</script>");
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    if (Date.now() - lastIndexAt > INDEX_REFRESH_MS || fileIndex.size === 0) buildFileIndex();
    const paused = isPaused();
    if (paused) {
      await Promise.all([...displayed].map(clearTask));
      snapshot = { connected: false, paused: true, tasks: [], syncedAt: new Date().toISOString(), error: "实时连接已暂停" };
      return;
    }
    const state = JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
    const tasks = [];
    for (const session of state.sessions || []) {
      const path = fileIndex.get(session.conversationId);
      if (!path) continue;
      try { tasks.push(analyzeSession(session, path)); } catch { /* A partial JSONL write is retried next cycle. */ }
    }
    tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const retainedIds = new Set([
      ...tasks.slice(0, 100).map((task) => task.id),
      ...displayed,
    ]);
    for (const id of acknowledged.keys()) if (!retainedIds.has(id)) acknowledged.delete(id);
    for (const id of previousStates.keys()) if (!retainedIds.has(id)) previousStates.delete(id);
    const candidates = [];
    for (const task of tasks) {
      const previous = previousStates.get(task.id);
      const signature = taskSignature(task);
      const shouldMountCompletion = task.state === "completed"
        && acknowledged.get(task.id) !== signature
        && (["active", "review", "failed", "completed"].includes(mountedStates.get(task.id))
          || ["active", "review", "failed"].includes(previous));
      if (["active", "review", "failed"].includes(task.state) || shouldMountCompletion) candidates.push(task);
      previousStates.set(task.id, task.state);
    }
    const selected = candidates.slice(0, MAX_TASKS);
    saveDisplayed();
    const selectedIds = new Set(selected.map((task) => task.id));
    await Promise.all([
      ...selected.map(relayTask),
      ...[...displayed].filter((id) => !selectedIds.has(id)).map(clearTask),
    ]);
    snapshot = { connected: true, paused: false, tasks: selected, syncedAt: new Date().toISOString(), error: null };
  } catch (error) {
    snapshot = { ...snapshot, connected: false, error: error instanceof Error ? error.message : "WorkBuddy 刷新失败" };
  } finally {
    refreshInFlight = false;
  }
}

loadDisplayed();
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
    if (!taskId) {
      response.writeHead(400).end("Missing task");
      return;
    }
    void acknowledgeTask(taskId).then((found) => {
      if (!found) response.writeHead(404).end("Task not found");
      else closeLauncherPage(response);
    });
    return;
  }
  response.writeHead(404).end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`WorkBuddy task bridge: http://127.0.0.1:${PORT}/tasks\n`);
  void refresh();
  setInterval(refresh, REFRESH_MS);
});

async function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
