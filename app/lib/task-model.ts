import { savePersistentValue } from "./persistent-storage";
import { ENGLISH_READING_STEPS, ENGLISH_READING_TASK_ID } from "./english-reading-data";

export const TASK_LIBRARY_KEY = "xiaobu-task-library-v1";
export const TASK_LIBRARY_BACKUP_KEY = "xiaobu-task-library-backups-v1";
export const TASK_SCHEMA_VERSION = "xiaobu.task.v1";
export const WEBSITE_TASK_ID = "task_mrok47yp_gxj0zt";
export const SELF_MEDIA_TASK_ID = "self-media";

export type TaskKind = "simple" | "complex";
export type TaskWorkspace = "daily" | "work";

export type TaskStep = {
  id: string;
  title: string;
  description?: string;
  goal: string;
  minutes: number;
  xp: number;
  checkXp?: number;
  checklist: string[];
  guidance?: string;
  fields?: Array<{ label: string; placeholder?: string; value?: string }>;
};

export type TaskBlocker = {
  id: string;
  stepIndex: number;
  stepTitle: string;
  problem: string;
  attempted?: string;
  solution?: string;
  status: "待解决" | "已解决";
  createdAt: string;
  resolvedAt?: string;
};

export type TaskReview = {
  result: string;
  lessons: string;
  nextAction: string;
  updatedAt: string;
};

export type TaskPackageV1 = {
  schemaVersion: "xiaobu.task.v1";
  task: {
    title: string;
    description?: string;
    agent?: string;
    type: TaskKind;
    workspace?: TaskWorkspace;
    category?: string;
    dueDate?: string;
    xp?: number;
    weeklyGoal?: string;
    overallGoal?: string;
    steps?: TaskStep[];
  };
};

export type StoredTask = TaskPackageV1["task"] & {
  id: string;
  createdAt: string;
  status: "待开始" | "进行中" | "已完成";
  blockers?: TaskBlocker[];
  review?: TaskReview;
  progress?: {
    current: number;
    completed: number[];
    rewarded: number[];
    checkState: Record<number, boolean[]>;
    checkRewardState: Record<number, boolean[]>;
    drafts: Record<number, string[]>;
    finished: boolean;
  };
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

export function makeTaskId() {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeTaskPackage(input: unknown): TaskPackageV1 {
  if (!input || typeof input !== "object") throw new Error("任务包不是有效对象");
  const root = input as Record<string, unknown>;
  if (root.schemaVersion !== TASK_SCHEMA_VERSION) throw new Error(`仅支持 ${TASK_SCHEMA_VERSION} 格式`);
  if (!root.task || typeof root.task !== "object") throw new Error("任务包缺少 task 字段");
  const source = root.task as Record<string, unknown>;
  const title = text(source.title);
  if (!title) throw new Error("任务标题不能为空");
  const type: TaskKind = source.type === "simple" ? "simple" : "complex";
  const rawSteps = Array.isArray(source.steps) ? source.steps : [];
  const steps: TaskStep[] = rawSteps.map((item, index) => {
    const step = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const stepTitle = text(step.title);
    if (!stepTitle) throw new Error(`第 ${index + 1} 步缺少标题`);
    const checklist = Array.isArray(step.checklist) ? step.checklist.map((value) => text(value)).filter(Boolean) : [];
    const rawFields = Array.isArray(step.fields) ? step.fields : [];
    return {
      id: text(step.id, `step_${index + 1}`),
      title: stepTitle,
      description: text(step.description),
      goal: text(step.goal, `完成“${stepTitle}”并确认结果可进入下一步。`),
      minutes: positiveNumber(step.minutes, 20),
      xp: positiveNumber(step.xp, 25),
      checkXp: positiveNumber(step.checkXp, 0) || undefined,
      checklist: checklist.length ? checklist : [`完成${stepTitle}`, "检查本步输出", "确认可以进入下一步"],
      guidance: text(step.guidance),
      fields: rawFields.map((field) => {
        const value = (field && typeof field === "object" ? field : {}) as Record<string, unknown>;
        return { label: text(value.label, "记录"), placeholder: text(value.placeholder), value: text(value.value) };
      }).slice(0, 6),
    };
  });
  if (type === "complex" && steps.length < 2) throw new Error("复杂任务至少需要 2 个步骤");
  return {
    schemaVersion: TASK_SCHEMA_VERSION,
    task: {
      title,
      description: text(source.description),
      agent: text(source.agent, "未分配 Agent"),
      type,
      workspace: source.workspace === "daily" ? "daily" : "work",
      category: text(source.category, "悟道"),
      dueDate: text(source.dueDate),
      xp: positiveNumber(source.xp, type === "simple" ? 20 : steps.reduce((sum, step) => sum + step.xp, 0)),
      weeklyGoal: text(source.weeklyGoal),
      overallGoal: text(source.overallGoal),
      steps,
    },
  };
}

export function taskFromPackage(pkg: TaskPackageV1): StoredTask {
  return {
    ...pkg.task,
    id: makeTaskId(),
    createdAt: new Date().toISOString(),
    status: pkg.task.type === "complex" ? "进行中" : "待开始",
    progress: pkg.task.type === "complex" ? {
      current: 0,
      completed: [],
      rewarded: [],
      checkState: {},
      checkRewardState: {},
      drafts: {},
      finished: false,
    } : undefined,
  };
}

export function loadTaskLibrary(): StoredTask[] {
  if (typeof window === "undefined") return [];
  try {
    const data = JSON.parse(localStorage.getItem(TASK_LIBRARY_KEY) ?? "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveTaskLibrary(tasks: StoredTask[]) {
  try {
    const current = JSON.parse(localStorage.getItem(TASK_LIBRARY_KEY) ?? "[]");
    if (Array.isArray(current) && current.length) {
      const backups = JSON.parse(localStorage.getItem(TASK_LIBRARY_BACKUP_KEY) ?? "[]");
      const nextBackups = [{ savedAt: new Date().toISOString(), tasks: current }, ...(Array.isArray(backups) ? backups : [])]
        .filter((snapshot, index, items) => index === 0 || JSON.stringify(snapshot.tasks) !== JSON.stringify(items[index - 1]?.tasks))
        .slice(0, 8);
      savePersistentValue(TASK_LIBRARY_BACKUP_KEY, JSON.stringify(nextBackups));
    }
  } catch {
    // A broken backup must never prevent the live task library from saving.
  }
  savePersistentValue(TASK_LIBRARY_KEY, JSON.stringify(tasks));
}

function recoverTaskFromBackups(id: string) {
  try {
    const backups = JSON.parse(localStorage.getItem(TASK_LIBRARY_BACKUP_KEY) ?? "[]");
    if (!Array.isArray(backups)) return undefined;
    for (const snapshot of backups) {
      const task = Array.isArray(snapshot?.tasks) ? snapshot.tasks.find((item: StoredTask) => item?.id === id) : undefined;
      if (task) return task as StoredTask;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function addTaskToLibrary(task: StoredTask) {
  const library = loadTaskLibrary();
  saveTaskLibrary([task, ...library.filter((item) => item.id !== task.id)]);
}

const websiteRecoveryTask: StoredTask = {
  id: WEBSITE_TASK_ID,
  createdAt: "2026-07-17T00:00:00.000Z",
  title: "企业官网升级示例",
  description: "完成官网关键信息迁移、内容页面整理、域名调整与发布检查。",
  agent: "Codex",
  type: "complex",
  workspace: "work",
  category: "网站搭建",
  dueDate: "持续推进",
  xp: 240,
  weeklyGoal: "完成企业官网迁移与关键页面建设",
  overallGoal: "建成并持续优化企业官网",
  status: "进行中",
  steps: [
    { id: "website_plan", title: "确定建站方案", description: "确认建站版本、功能边界与实施方案。", goal: "完成建站方案选择并保留关键信息。", minutes: 30, xp: 60, checklist: ["确认版本与功能", "记录最终方案", "保存实施信息"], guidance: "先确认版本能力，再继续迁移，避免后期返工。" },
    { id: "website_migration", title: "迁移网站信息", description: "把原网站的重要内容逐项迁移到新官网。", goal: "完成新闻、常见问题与资讯内容的迁移和检查。", minutes: 20, xp: 80, checklist: ["首页新闻动态", "常见问题页", "资讯动态页"], guidance: "先完成可用版本，再根据页面效果逐项优化。" },
    { id: "website_domain", title: "域名变更", description: "完成域名指向、SSL 与发布后的访问检查。", goal: "让新官网通过正式域名稳定访问。", minutes: 40, xp: 100, checklist: ["确认域名解析方案", "完成域名绑定与 SSL", "检查电脑端和手机端访问"], guidance: "切换前保留旧站信息，完成后逐页检查链接和 HTTPS。" },
  ],
  progress: {
    current: 1,
    completed: [0],
    rewarded: [0],
    checkState: { 0: [true, true, true], 1: [false, false, false] },
    checkRewardState: { 0: [true, true, true], 1: [false, false, false] },
    drafts: {},
    finished: false,
  },
};

export function ensureWebsiteTask(): StoredTask[] {
  const library = loadTaskLibrary();
  const existing = library.find((task) => task.id === WEBSITE_TASK_ID);
  if (existing) {
    if (existing.agent) return library;
    const next = library.map((task) => task.id === WEBSITE_TASK_ID ? { ...task, agent: "Codex" } : task);
    saveTaskLibrary(next);
    return next;
  }
  const recovered = recoverTaskFromBackups(WEBSITE_TASK_ID) ?? websiteRecoveryTask;
  const next = [recovered, ...library];
  saveTaskLibrary(next);
  return next;
}

const selfMediaSteps: TaskStep[] = [
  { id: "self_media_1", title: "明确账号定位", goal: "写清楚账号服务谁、解决什么问题，以及内容边界。", minutes: 20, xp: 30, checklist: ["确定目标受众", "写出一句话定位", "明确三个内容支柱"], guidance: "定位不是限制，而是帮助观众快速记住你。", fields: [{ label: "目标受众", value: "帮助刚开始做内容的个人创作者" }, { label: "一句话定位", value: "用清晰的方法，把复杂工作拆成能执行的小步骤" }, { label: "内容支柱", value: "任务拆解、效率系统、真实实践" }] },
  { id: "self_media_2", title: "建立选题库", goal: "整理至少 10 个可以立即开始制作的真实选题。", minutes: 30, xp: 35, checklist: ["收集受众常见问题", "整理 10 个具体选题", "标记优先发布顺序"], guidance: "优先选择你有真实经验、能给出具体细节的选题。", fields: [{ label: "受众问题", value: "为什么任务越列越焦虑？" }, { label: "候选选题", value: "一个复杂项目应该怎样拆解？" }, { label: "优先选题", value: "怎样建立自己的每周复盘系统？" }] },
  { id: "self_media_3", title: "撰写视频脚本", goal: "完成一份可直接拍摄的 60 秒口播脚本。", minutes: 25, xp: 35, checklist: ["确定开头 3 秒钩子", "写出核心观点与案例", "补充结尾行动引导"], guidance: "先完成可用版本，不必一次写到完美。", fields: [{ label: "开头钩子", value: "你知道吗？90% 的自媒体账号，死在了第一条内容上。" }, { label: "核心内容", value: "做自媒体，定位比努力更重要。\n我用这套三层定位法：帮自己、30 天涨粉 1w+。\n今天把完整思路和一个真实案例拆给你看。" }, { label: "结尾引导", value: "如果对你有帮助，记得点赞收藏，下一条我分享选题库怎么搭建。" }] },
  { id: "self_media_4", title: "准备拍摄素材", goal: "把拍摄需要的人、物、场景和参考资料一次准备齐。", minutes: 20, xp: 25, checklist: ["确认拍摄场景", "准备道具和资料", "列出镜头清单"], guidance: "提前排除环境噪音和画面杂物，拍摄会顺畅很多。", fields: [{ label: "拍摄场景", value: "书桌靠窗位置，上午自然光" }, { label: "道具资料", value: "手机、领夹麦克风、脚本提示卡" }, { label: "镜头清单", value: "正面口播、手部特写、产品界面录屏" }] },
  { id: "self_media_5", title: "完成视频拍摄", goal: "按照脚本和镜头清单完成一版可用素材。", minutes: 35, xp: 45, checklist: ["完成主镜头拍摄", "补拍必要特写", "检查声音与画面"], guidance: "每段之间停顿一秒，后期剪辑会更轻松。", fields: [{ label: "主镜头", value: "主镜头拍摄完成" }, { label: "补拍内容", value: "补拍手部操作和产品页面" }, { label: "质量检查", value: "环境音清晰，曝光正常" }] },
  { id: "self_media_6", title: "剪辑与包装", goal: "完成节奏清楚、字幕准确、封面统一的发布版本。", minutes: 45, xp: 50, checklist: ["完成粗剪与节奏调整", "添加字幕和重点标记", "制作标题与封面"], guidance: "删掉不能推进观点的句子，让每一秒都有作用。", fields: [{ label: "节奏调整", value: "开头 3 秒直接提出问题" }, { label: "字幕样式", value: "重点句使用暖黄色字幕" }, { label: "封面文案", value: "复杂任务，如何真正做完？" }] },
  { id: "self_media_7", title: "发布内容", goal: "完成标题、正文、标签设置并正式发布。", minutes: 15, xp: 30, checklist: ["检查标题和封面", "补充正文与标签", "选择时间并发布"], guidance: "发布不是终点，记录发布时间，为后续复盘保留依据。", fields: [{ label: "标题", value: "复杂任务，如何一步一步真正做完？" }, { label: "正文", value: "把大任务拆成当前一步，你只需要完成眼前这一件。" }, { label: "标签", value: "#任务管理 #个人成长 #效率工具" }] },
  { id: "self_media_8", title: "数据复盘", goal: "记录关键数据，提炼一条下一次可以改进的结论。", minutes: 20, xp: 40, checklist: ["记录播放与互动数据", "分析高低留存位置", "写出下一次改进行动"], guidance: "一次只找一个最值得改进的变量，避免过度解读数据。", fields: [{ label: "关键数据", value: "播放量、完播率、点赞、收藏" }, { label: "留存观察", value: "开头第 5 秒出现明显流失" }, { label: "改进行动", value: "下次把背景介绍缩短 3 秒" }] },
];

export function ensureSelfMediaTask(): StoredTask[] {
  const library = loadTaskLibrary();
  const existing = library.find((task) => task.id === SELF_MEDIA_TASK_ID);
  if (existing) {
    if (existing.agent) return library;
    const next = library.map((task) => task.id === SELF_MEDIA_TASK_ID ? { ...task, agent: "ChatGPT" } : task);
    saveTaskLibrary(next);
    return next;
  }

  let legacy: Partial<NonNullable<StoredTask["progress"]>> = {};
  try {
    legacy = JSON.parse(localStorage.getItem("xiaobu-self-media-progress") ?? "{}") ?? {};
  } catch {
    legacy = {};
  }
  const completed = Array.isArray(legacy.completed) ? legacy.completed.filter((index) => Number.isInteger(index) && index >= 0 && index < selfMediaSteps.length) : [0, 1];
  const current = Math.max(0, Math.min(selfMediaSteps.length - 1, Number.isInteger(legacy.current) ? Number(legacy.current) : 2));
  const finished = Boolean(legacy.finished);
  const task: StoredTask = {
    id: SELF_MEDIA_TASK_ID,
    createdAt: new Date().toISOString(),
    title: "运营自媒体账号",
    description: "从账号定位、内容生产到发布复盘，建立一套可持续的内容工作流。",
    agent: "ChatGPT",
    type: "complex",
    workspace: "work",
    category: "内容运营",
    dueDate: "长期项目",
    xp: 290,
    weeklyGoal: "完成自媒体账号冷启动",
    overallGoal: "建立个人内容品牌",
    status: finished ? "已完成" : "进行中",
    steps: selfMediaSteps,
    progress: {
      current,
      completed,
      rewarded: Array.isArray(legacy.rewarded) ? legacy.rewarded : completed,
      checkState: legacy.checkState ?? {},
      checkRewardState: legacy.checkRewardState ?? {},
      drafts: legacy.drafts ?? {},
      finished,
    },
  };
  const next = [task, ...library];
  saveTaskLibrary(next);
  return next;
}

export function ensureEnglishReadingTask(): StoredTask[] {
  const library = loadTaskLibrary();
  const existing = library.find((task) => task.id === ENGLISH_READING_TASK_ID);
  if (existing) {
    if (existing.agent) return library;
    const next = library.map((task) => task.id === ENGLISH_READING_TASK_ID ? { ...task, agent: "Qoder" } : task);
    saveTaskLibrary(next);
    return next;
  }
  const steps = ENGLISH_READING_STEPS;
  const totalXp = steps.reduce((sum, step) => sum + step.xp, 0);
  const task: StoredTask = {
    id: ENGLISH_READING_TASK_ID,
    createdAt: new Date().toISOString(),
    title: "四级真题阅读（词块法）",
    description: "24 篇四级真题，逐篇贴给 AI 逐句讲解词块，学完生成词块标注版与总结，积累进 Obsidian 搭配本。一天一篇稳步推进。",
    agent: "Qoder",
    type: "complex",
    workspace: "work",
    category: "悟道",
    dueDate: "长期项目",
    xp: totalXp,
    weeklyGoal: "四级阅读过关（425）",
    overallGoal: "英语四级 425 过线",
    status: "进行中",
    steps,
    progress: {
      current: 0,
      completed: [],
      rewarded: [],
      checkState: {},
      checkRewardState: {},
      drafts: {},
      finished: false,
    },
  };
  const next = [task, ...library];
  saveTaskLibrary(next);
  return next;
}

export const exampleAgentPackage: TaskPackageV1 = {
  schemaVersion: "xiaobu.task.v1",
  task: {
    title: "完成一篇高质量公众号文章",
    description: "从选题到发布复盘，完成一篇结构清晰的原创内容。",
    agent: "Codex",
    type: "complex",
    category: "器道",
    dueDate: "本周日",
    weeklyGoal: "稳定输出一篇原创内容",
    overallGoal: "建立个人内容品牌",
    steps: [
      { id: "step_1", title: "明确选题与读者", goal: "确认文章解决的具体问题。", minutes: 20, xp: 25, checklist: ["写出目标读者", "确认核心问题", "确定文章承诺"], guidance: "选题越具体，写作越容易。" },
      { id: "step_2", title: "搭建文章结构", goal: "完成标题、开头和三级提纲。", minutes: 25, xp: 30, checklist: ["拟定标题", "列出三级提纲", "准备一个真实案例"] },
      { id: "step_3", title: "完成初稿", goal: "沿着提纲写出完整可读版本。", minutes: 60, xp: 50, checklist: ["写完开头", "完成主体", "补充结尾行动建议"] },
      { id: "step_4", title: "修改并发布", goal: "完成校对、排版和发布。", minutes: 35, xp: 40, checklist: ["删减冗余内容", "完成排版校对", "发布并记录时间"] },
    ],
  },
};
