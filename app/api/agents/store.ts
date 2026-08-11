export type AgentTaskState = "推进中" | "等待中" | "需要介入" | "已阻塞" | "已完成";

export type AgentTask = {
  id: string;
  agent: string;
  title: string;
  summary: string;
  state: AgentTaskState;
  stateNote: string;
  runtimeStatus: string;
  updatedAt: string;
  cwd: string;
  canAcceptInput: boolean;
};

type AgentRecord = {
  id: string;
  name: string;
  connectedAt: string;
  lastHeartbeat: string;
  status: "online" | "offline";
};

type AgentStore = { agents: Map<string, AgentRecord>; tasks: Map<string, AgentTask>; receivingEnabled: boolean; realtimeEnabled: boolean };

const globalStore = globalThis as typeof globalThis & { __xiaobuAgentStore?: AgentStore };
const store: AgentStore = globalStore.__xiaobuAgentStore ?? { agents: new Map(), tasks: new Map(), receivingEnabled: false, realtimeEnabled: false };
globalStore.__xiaobuAgentStore = store;

const stateMap: Record<string, AgentTaskState> = {
  processing: "推进中", active: "推进中", running: "推进中", 推进中: "推进中", 正在处理: "推进中",
  waiting: "等待中", idle: "等待中", 等待中: "等待中", 等待: "等待中",
  attention: "需要介入", needs_input: "需要介入", 需要介入: "需要介入", 需要你: "需要介入",
  blocked: "已阻塞", error: "已阻塞", 已阻塞: "已阻塞",
  completed: "已完成", complete: "已完成", done: "已完成", 已完成: "已完成",
};

export function normalizeTask(agentId: string, agentName: string, input: Record<string, unknown>): AgentTask {
  const rawState = typeof input.state === "string" ? input.state : "waiting";
  const state = stateMap[rawState] ?? "等待中";
  const taskId = typeof input.taskId === "string" ? input.taskId : typeof input.id === "string" ? input.id : crypto.randomUUID();
  const updatedAt = typeof input.updatedAt === "string" && Number.isFinite(new Date(input.updatedAt).getTime()) ? input.updatedAt : new Date().toISOString();
  return {
    id: `${agentId}:${taskId}`,
    agent: agentName,
    title: typeof input.title === "string" ? input.title.slice(0, 120) : "未命名任务",
    summary: typeof input.summary === "string" ? input.summary.slice(0, 240) : "暂无任务摘要",
    state,
    stateNote: typeof input.stateNote === "string" ? input.stateNote.slice(0, 240) : "任务已接入，等待下一次更新",
    runtimeStatus: typeof input.runtimeStatus === "string" ? input.runtimeStatus : rawState,
    updatedAt,
    cwd: typeof input.cwd === "string" ? input.cwd : "",
    canAcceptInput: input.canAcceptInput === true,
  };
}

export function registerAgent(input: Record<string, unknown>) {
  const id = typeof input.agentId === "string" ? input.agentId : typeof input.id === "string" ? input.id : "external-agent";
  const now = new Date().toISOString();
  const existing = store.agents.get(id);
  store.agents.set(id, { id, name: typeof input.name === "string" ? input.name.slice(0, 60) : id, connectedAt: existing?.connectedAt ?? now, lastHeartbeat: now, status: "online" });
  return store.agents.get(id);
}

export function upsertTask(input: Record<string, unknown>) {
  if (!store.receivingEnabled) return null;
  const agent = registerAgent(input);
  const task = normalizeTask(agent!.id, agent!.name, (input.task && typeof input.task === "object" ? input.task : input) as Record<string, unknown>);
  store.tasks.set(task.id, task);
  return task;
}

export function heartbeat(input: Record<string, unknown>) {
  if (!store.receivingEnabled) return null;
  return registerAgent(input);
}

export function setReceivingEnabled(enabled: boolean) {
  store.receivingEnabled = enabled;
  return store.receivingEnabled;
}

export function setRealtimeEnabled(enabled: boolean) {
  store.realtimeEnabled = enabled;
  store.receivingEnabled = enabled;
  return store.realtimeEnabled;
}

export function snapshot() {
  const now = Date.now();
  const agents = [...store.agents.values()].map((agent) => ({ ...agent, status: store.receivingEnabled && now - new Date(agent.lastHeartbeat).getTime() < 90_000 ? "online" : "offline" as const }));
  const tasks = [...store.tasks.values()].map((task) => store.receivingEnabled ? task : { ...task, state: "等待中" as const, runtimeStatus: "paused", stateNote: "实时连接已暂停，等待恢复" }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { receivingEnabled: store.receivingEnabled, realtimeEnabled: store.realtimeEnabled, agents, tasks, syncedAt: new Date().toISOString() };
}
