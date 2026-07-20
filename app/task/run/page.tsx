"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { loadTaskLibrary, saveTaskLibrary, type StoredTask, type TaskBlocker, type TaskReview, type TaskStep } from "../../lib/task-model";
import { addTip, imageFileToDataUrl, loadTips, saveTips, TIP_CATEGORIES, type WorkTip } from "../../lib/tip-model";
import { savePersistentValue } from "../../lib/persistent-storage";

function getCheckRewardXp(step?: TaskStep) {
  if (!step) return 0;
  return step.checkXp ?? Math.max(5, Math.round(step.xp / Math.max(1, step.checklist.length) / 5) * 5);
}

function suggestTipCategory(taskTitle = "", stepTitle = "") {
  const source = `${taskTitle} ${stepTitle}`;
  if (/网站|首页|页面|域名|SEO|Banner/i.test(source)) return "网站搭建";
  if (/文章|新闻|资讯|自媒体|内容|视频/i.test(source)) return "内容运营";
  if (/商品|1688|详情页|发布|店铺/i.test(source)) return "电商运营";
  if (/图片|设计|排版|字体|色彩/i.test(source)) return "设计排版";
  if (/脚本|自动化|Agent|API/i.test(source)) return "自动化工具";
  if (/数据|表格|统计|报表/i.test(source)) return "数据处理";
  return "问题排查";
}

export default function GenericTaskRunner() {
  const [task, setTask] = useState<StoredTask | null>(null);
  const [checks, setChecks] = useState<Record<number, boolean[]>>({});
  const [drafts, setDrafts] = useState<Record<number, string[]>>({});
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [editingBlockerId, setEditingBlockerId] = useState<string | null>(null);
  const [blockerForm, setBlockerForm] = useState({ problem: "", attempted: "", solution: "", status: "待解决" as TaskBlocker["status"] });
  const [review, setReview] = useState<TaskReview>({ result: "", lessons: "", nextAction: "", updatedAt: "" });
  const [archiveNotice, setArchiveNotice] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [tipImage, setTipImage] = useState("");
  const [taskTips, setTaskTips] = useState<WorkTip[]>([]);
  const [tipForm, setTipForm] = useState({ title: "", category: "工作技巧", scenario: "", steps: "", note: "" });
  const [editingFlow, setEditingFlow] = useState(false);
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [dragOverStepIndex, setDragOverStepIndex] = useState<number | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    const found = loadTaskLibrary().find((item) => item.id === id) ?? null;
    setTask(found);
    setChecks(found?.progress?.checkState ?? {});
    setDrafts(found?.progress?.drafts ?? {});
    setReview(found?.review ?? { result: "", lessons: "", nextAction: "", updatedAt: "" });
    setTaskTips(loadTips().filter((tip) => tip.taskId === found?.id));
    setFinished(Boolean(found?.progress?.finished));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const steps = useMemo(() => task?.steps ?? [], [task]);
  const currentIndex = task?.progress?.current ?? 0;
  const current = steps[currentIndex];
  const completed = task?.progress?.completed ?? [];
  const rewarded = task?.progress?.rewarded ?? [];
  const currentChecks = current ? (checks[currentIndex] ?? current.checklist.map(() => false)) : [];
  const checkRewardState = task?.progress?.checkRewardState ?? {};
  const currentCheckRewards = current ? (checkRewardState[currentIndex] ?? current.checklist.map(() => false)) : [];
  const currentFields = current?.fields?.length ? current.fields : [{ label: "本步输出", placeholder: "记录完成结果、关键内容或下一步需要的信息…", value: "" }];
  const currentDrafts = current ? (drafts[currentIndex] ?? currentFields.map((field) => field.value ?? "")) : [];
  const percent = steps.length ? Math.round((completed.length / steps.length) * 100) : 0;
  const checklistEarned = Object.entries(checkRewardState).reduce((sum, [stepIndex, rewards]) => sum + rewards.filter(Boolean).length * getCheckRewardXp(steps[Number(stepIndex)]), 0);
  const earned = rewarded.reduce((sum, index) => sum + (steps[index]?.xp ?? 0), 0) + checklistEarned;
  const remaining = steps.slice(currentIndex).reduce((sum, step) => sum + step.minutes, 0);
  const blockers = task?.blockers ?? [];
  const currentBlockers = blockers.filter((item) => item.stepIndex === currentIndex);
  const unresolvedCount = blockers.filter((item) => item.status === "待解决").length;

  function persist(next: StoredTask, nextChecks = checks, nextDrafts = drafts) {
    const library = loadTaskLibrary();
    saveTaskLibrary(library.map((item) => item.id === next.id ? next : item));
    setTask(next);
    setChecks(nextChecks);
    setDrafts(nextDrafts);
  }

  function updateCheck(index: number) {
    if (!task || !current) return;
    const values = [...currentChecks];
    values[index] = !values[index];
    const nextChecks = { ...checks, [currentIndex]: values };
    let nextCheckRewards = checkRewardState;
    if (values[index] && !currentCheckRewards[index]) {
      const stepRewards = [...currentCheckRewards];
      stepRewards[index] = true;
      nextCheckRewards = { ...checkRewardState, [currentIndex]: stepRewards };
      const amount = getCheckRewardXp(current);
      addXp(amount);
      setReward(amount);
      window.setTimeout(() => setReward(null), 2200);
    }
    persist({ ...task, progress: { ...task.progress!, checkState: nextChecks, checkRewardState: nextCheckRewards, drafts } }, nextChecks, drafts);
    setError("");
  }

  function updateDraft(index: number, value: string) {
    if (!task) return;
    const values = [...currentDrafts];
    values[index] = value;
    const nextDrafts = { ...drafts, [currentIndex]: values };
    persist({ ...task, progress: { ...task.progress!, drafts: nextDrafts, checkState: checks } }, checks, nextDrafts);
  }

  function updateCurrentStep(patch: Partial<typeof current>, nextChecks = checks, nextCheckRewards = checkRewardState) {
    if (!task || !current || !task.progress) return;
    const nextSteps = steps.map((step, index) => index === currentIndex ? { ...step, ...patch } : step);
    persist({ ...task, steps: nextSteps, progress: { ...task.progress, checkState: nextChecks, checkRewardState: nextCheckRewards, drafts } }, nextChecks, drafts);
  }

  function updateChecklistText(index: number, value: string) {
    const checklist = [...current.checklist];
    checklist[index] = value;
    updateCurrentStep({ checklist });
  }

  function addChecklistItem() {
    const checklist = [...current.checklist, "新的检查项"];
    const nextChecks = { ...checks, [currentIndex]: [...currentChecks, false] };
    const nextCheckRewards = { ...checkRewardState, [currentIndex]: [...currentCheckRewards, false] };
    updateCurrentStep({ checklist }, nextChecks, nextCheckRewards);
  }

  function removeChecklistItem(index: number) {
    if (current.checklist.length <= 1) return;
    const checklist = current.checklist.filter((_, itemIndex) => itemIndex !== index);
    const nextChecks = { ...checks, [currentIndex]: currentChecks.filter((_, itemIndex) => itemIndex !== index) };
    const nextCheckRewards = { ...checkRewardState, [currentIndex]: currentCheckRewards.filter((_, itemIndex) => itemIndex !== index) };
    updateCurrentStep({ checklist }, nextChecks, nextCheckRewards);
  }

  function remapStepRecords<T>(records: Record<number, T>, changedIndex: number, direction: "insert" | "remove") {
    return Object.fromEntries(Object.entries(records).flatMap(([key, value]) => {
      const index = Number(key);
      if (direction === "remove" && index === changedIndex) return [];
      if (index < changedIndex) return [[index, value]];
      return [[direction === "insert" ? index + 1 : index - 1, value]];
    })) as Record<number, T>;
  }

  function updateTipStepIndexes(mapIndex: (index: number) => number | null, nextSteps: TaskStep[]) {
    if (!task) return;
    const nextTips = loadTips().map((tip) => {
      if (tip.taskId !== task.id || typeof tip.stepIndex !== "number" || tip.stepIndex < 0) return tip;
      const nextIndex = mapIndex(tip.stepIndex);
      if (nextIndex === null || nextIndex < 0) return { ...tip, stepIndex: undefined };
      return { ...tip, stepIndex: nextIndex, stepTitle: nextSteps[nextIndex]?.title ?? tip.stepTitle };
    });
    saveTips(nextTips);
    setTaskTips(nextTips.filter((tip) => tip.taskId === task.id));
  }

  function insertStepAt(position: number) {
    if (!task?.progress) return;
    const insertAt = Math.max(0, Math.min(position, steps.length));
    const newStep = {
      id: `step_${Date.now().toString(36)}`,
      title: "新的步骤",
      description: "",
      goal: "写下这一步需要达成的结果。",
      minutes: 20,
      xp: 25,
      checklist: ["完成本步核心操作", "检查本步输出", "确认可以继续下一步"],
      guidance: "先完成可用版本，再根据结果优化。",
    };
    const nextSteps = [...steps.slice(0, insertAt), newStep, ...steps.slice(insertAt)];
    const nextChecks = remapStepRecords(checks, insertAt, "insert");
    const nextCheckRewards = remapStepRecords(checkRewardState, insertAt, "insert");
    const nextDrafts = remapStepRecords(drafts, insertAt, "insert");
    const shift = (indexes: number[]) => indexes.map((index) => index >= insertAt ? index + 1 : index);
    const nextBlockers = blockers.map((item) => item.stepIndex >= insertAt ? { ...item, stepIndex: item.stepIndex + 1 } : item);
    updateTipStepIndexes((index) => index >= insertAt ? index + 1 : index, nextSteps);
    persist({ ...task, status: "进行中", steps: nextSteps, blockers: nextBlockers, progress: { ...task.progress, current: insertAt, completed: shift(completed), rewarded: shift(rewarded), checkState: nextChecks, checkRewardState: nextCheckRewards, drafts: nextDrafts, finished: false } }, nextChecks, nextDrafts);
  }

  function removeStep(index: number) {
    if (!task?.progress || steps.length <= 1) return;
    const nextSteps = steps.filter((_, stepIndex) => stepIndex !== index);
    const nextChecks = remapStepRecords(checks, index, "remove");
    const nextCheckRewards = remapStepRecords(checkRewardState, index, "remove");
    const nextDrafts = remapStepRecords(drafts, index, "remove");
    const shift = (indexes: number[]) => indexes.filter((item) => item !== index).map((item) => item > index ? item - 1 : item);
    const nextCurrent = index < currentIndex ? currentIndex - 1 : index === currentIndex ? Math.min(currentIndex, nextSteps.length - 1) : currentIndex;
    const nextBlockers = blockers.map((item) => item.stepIndex === index ? { ...item, stepIndex: -1 } : item.stepIndex > index ? { ...item, stepIndex: item.stepIndex - 1 } : item);
    updateTipStepIndexes((itemIndex) => itemIndex === index ? null : itemIndex > index ? itemIndex - 1 : itemIndex, nextSteps);
    persist({ ...task, steps: nextSteps, blockers: nextBlockers, progress: { ...task.progress, current: nextCurrent, completed: shift(completed), rewarded: shift(rewarded), checkState: nextChecks, checkRewardState: nextCheckRewards, drafts: nextDrafts } }, nextChecks, nextDrafts);
  }

  function moveStep(fromIndex: number, toIndex: number) {
    if (!task?.progress || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= steps.length || toIndex >= steps.length) return;
    const nextSteps = [...steps];
    const [moved] = nextSteps.splice(fromIndex, 1);
    nextSteps.splice(toIndex, 0, moved);
    const nextIndexFor = (oldIndex: number) => {
      const stepId = steps[oldIndex]?.id;
      return stepId ? nextSteps.findIndex((step) => step.id === stepId) : oldIndex;
    };
    const reorderRecords = <T,>(records: Record<number, T>) => Object.fromEntries(Object.entries(records).map(([key, value]) => [nextIndexFor(Number(key)), value])) as Record<number, T>;
    const nextChecks = reorderRecords(checks);
    const nextCheckRewards = reorderRecords(checkRewardState);
    const nextDrafts = reorderRecords(drafts);
    const reorderIndexes = (indexes: number[]) => indexes.map(nextIndexFor).sort((a, b) => a - b);
    const nextBlockers = blockers.map((item) => item.stepIndex < 0 ? item : { ...item, stepIndex: nextIndexFor(item.stepIndex), stepTitle: steps[item.stepIndex]?.title ?? item.stepTitle });
    updateTipStepIndexes(nextIndexFor, nextSteps);
    persist({ ...task, steps: nextSteps, blockers: nextBlockers, progress: { ...task.progress, current: nextIndexFor(currentIndex), completed: reorderIndexes(completed), rewarded: reorderIndexes(rewarded), checkState: nextChecks, checkRewardState: nextCheckRewards, drafts: nextDrafts } }, nextChecks, nextDrafts);
  }

  function beginStepDrag(event: DragEvent<HTMLSpanElement>, index: number) {
    setDraggedStepIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function dropStep(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
    const sourceIndex = draggedStepIndex ?? Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(sourceIndex)) moveStep(sourceIndex, index);
    setDraggedStepIndex(null);
    setDragOverStepIndex(null);
  }

  function toggleFlowEditing() {
    if (!task?.progress) return;
    if (editingFlow) {
      const firstOpen = steps.findIndex((_, index) => !completed.includes(index));
      persist({ ...task, progress: { ...task.progress, current: firstOpen === -1 ? steps.length - 1 : firstOpen } });
    }
    setEditingFlow((value) => !value);
  }

  function addXp(amount: number) {
    try {
      const dashboard = JSON.parse(localStorage.getItem("xiaobu-xiuxian-state") ?? "{}");
      savePersistentValue("xiaobu-xiuxian-state", JSON.stringify({ ...dashboard, cultivation: (dashboard.cultivation ?? 2740) + amount, todayXp: (dashboard.todayXp ?? 60) + amount }));
    } catch { /* Keep the runner usable with invalid legacy data. */ }
  }

  function completeStep() {
    if (!task || !current || !task.progress) return;
    const alreadyDone = completed.includes(currentIndex);
    if (!alreadyDone && (!currentChecks.every(Boolean) || !currentDrafts.some((value) => value.trim()))) {
      setError("请完成检查项并记录本步输出，再进入下一步。");
      return;
    }
    const nextCompleted = alreadyDone ? completed : [...completed, currentIndex].sort((a, b) => a - b);
    const nextRewarded = alreadyDone ? rewarded : [...rewarded, currentIndex];
    if (!alreadyDone) {
      addXp(current.xp);
      setReward(current.xp);
      window.setTimeout(() => setReward(null), 2200);
    }
    const isLast = currentIndex === steps.length - 1;
    const next: StoredTask = {
      ...task,
      status: isLast ? "已完成" : "进行中",
      progress: {
        ...task.progress,
        current: isLast ? currentIndex : currentIndex + 1,
        completed: nextCompleted,
        rewarded: nextRewarded,
        checkState: checks,
        drafts,
        finished: isLast,
      },
    };
    persist(next);
    setError("");
    if (isLast) setFinished(true);
  }

  function openBlocker(item?: TaskBlocker) {
    setEditingBlockerId(item?.id ?? null);
    setBlockerForm(item ? { problem: item.problem, attempted: item.attempted ?? "", solution: item.solution ?? "", status: item.status } : { problem: "", attempted: "", solution: "", status: "待解决" });
    setBlockerOpen(true);
  }

  function saveBlocker() {
    if (!task || !current || !blockerForm.problem.trim()) return;
    const now = new Date().toISOString();
    const existing = editingBlockerId ? blockers.find((item) => item.id === editingBlockerId) : undefined;
    const record: TaskBlocker = {
      id: existing?.id ?? `blocker_${Date.now().toString(36)}`,
      stepIndex: existing?.stepIndex ?? currentIndex,
      stepTitle: existing?.stepTitle ?? current.title,
      problem: blockerForm.problem.trim(),
      attempted: blockerForm.attempted.trim(),
      solution: blockerForm.solution.trim(),
      status: blockerForm.solution.trim() ? blockerForm.status : "待解决",
      createdAt: existing?.createdAt ?? now,
      resolvedAt: blockerForm.status === "已解决" && blockerForm.solution.trim() ? existing?.resolvedAt ?? now : undefined,
    };
    const nextBlockers = existing ? blockers.map((item) => item.id === record.id ? record : item) : [...blockers, record];
    persist({ ...task, blockers: nextBlockers });
    setBlockerOpen(false);
  }

  function updateReview(field: keyof Pick<TaskReview, "result" | "lessons" | "nextAction">, value: string) {
    if (!task) return;
    const next = { ...review, [field]: value, updatedAt: new Date().toISOString() };
    setReview(next);
    persist({ ...task, review: next });
  }

  function openTip() {
    setTipForm({ title: "", category: suggestTipCategory(task?.title, current?.title), scenario: "", steps: "", note: "" });
    setTipImage("");
    setTipOpen(true);
  }

  async function setTipScreenshot(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    setTipImage(await imageFileToDataUrl(file));
  }

  function saveTip() {
    if (!task || !current || !tipForm.title.trim() || !tipForm.steps.trim()) return;
    const tip: WorkTip = {
      id: `tip_${Date.now().toString(36)}`,
      title: tipForm.title.trim(),
      category: tipForm.category.trim() || "工作技巧",
      scenario: tipForm.scenario.trim(),
      steps: tipForm.steps.split("\n").map((item) => item.replace(/^\s*\d+[.、)）]?\s*/, "").trim()).filter(Boolean),
      note: tipForm.note.trim(),
      image: tipImage || undefined,
      taskId: task.id,
      taskTitle: task.title,
      stepIndex: currentIndex,
      stepTitle: current.title,
      createdAt: new Date().toISOString(),
      verified: true,
    };
    addTip(tip);
    setTaskTips((items) => [tip, ...items]);
    setTipOpen(false);
  }

  function archiveMarkdown() {
    if (!task) return "";
    const date = new Date().toISOString().slice(0, 10);
    const outputs = steps.map((step, index) => {
      const values = (drafts[index] ?? []).filter((value) => value.trim());
      return `### ${index + 1}. ${step.title}\n- 状态：${completed.includes(index) ? "已完成" : "未完成"}\n${values.length ? values.map((value) => `- 输出：${value.replace(/\n/g, " ")}`).join("\n") : "- 输出：未记录"}`;
    }).join("\n\n");
    const blockerText = blockers.length ? blockers.map((item, index) => `### 卡点 ${index + 1}：${item.problem}\n- 所在步骤：${item.stepTitle}\n- 状态：${item.status}\n- 尝试过：${item.attempted || "未记录"}\n- 解决办法：${item.solution || "待补充"}`).join("\n\n") : "本任务未记录卡点。";
    const tipText = taskTips.length ? taskTips.map((tip, index) => `### 技巧 ${index + 1}：${tip.title}\n- 来源任务：${tip.taskTitle || task.title}\n- 任务 ID：${tip.taskId || task.id}\n- 来源步骤：第 ${(tip.stepIndex ?? 0) + 1} 步 · ${tip.stepTitle || "未记录"}\n- 适用场景：${tip.scenario || "未记录"}\n- 操作步骤：\n${tip.steps.map((step, stepIndex) => `  ${stepIndex + 1}. ${step}`).join("\n")}\n- 关键提醒：${tip.note || "无"}`).join("\n\n") : "本任务未记录独立技巧。";
    return `---\ntype: task-review\nstatus: completed\nai_ready: no\nsource: 小步修仙\ntask_id: ${task.id}\ncreated: ${date}\n---\n\n# ${task.title} · 任务复盘\n\n> 本笔记由小步修仙任务工作区导出。先作为真实工作复盘保存，经验经验证后再升级为知识或 SOP。\n\n## 任务结果\n\n${review.result || task.description || "待补充最终交付结果。"}\n\n## 执行过程\n\n${outputs}\n\n## 卡点与解决办法\n\n${blockerText}\n\n## 工作技巧\n\n${tipText}\n\n## 复盘\n\n### 哪些做法有效\n${review.lessons || "待补充。"}\n\n### 下一步行动\n${review.nextAction || "待补充。"}\n\n## 沉淀判断\n- [ ] 是否有结果或证据支持？\n- [ ] 是否说明适用边界？\n- [ ] 是否值得更新项目页、纠正记录或 SOP？\n`;
  }

  async function copyArchive() {
    await navigator.clipboard.writeText(archiveMarkdown());
    setArchiveNotice("Markdown 已复制");
  }

  function saveToObsidian() {
    if (!task) return;
    const date = new Date().toISOString().slice(0, 10);
    const safeTitle = task.title.replace(/[\\/:*?"<>|#^[\]]/g, "-").slice(0, 60);
    const file = `80_工作复盘/${date}_${safeTitle}_任务复盘`;
    const uri = `obsidian://new?vault=${encodeURIComponent("工作知识库")}&file=${encodeURIComponent(file)}&content=${encodeURIComponent(archiveMarkdown())}`;
    setArchiveNotice("正在打开 Obsidian…");
    window.location.href = uri;
  }

  function selectStep(index: number) {
    if (!task?.progress) return;
    const firstOpen = Math.min(steps.length - 1, completed.length);
    if (!editingFlow && index > firstOpen && !completed.includes(index)) return;
    persist({ ...task, progress: { ...task.progress, current: index } });
    setError("");
  }

  if (!task) return <main className="runner-empty"><span>卷</span><h1>没有找到这个任务</h1><p>它可能尚未导入，或本地数据已经被清理。</p><a href="/task/new">创建或导入任务</a></main>;
  if (!current) return <main className="runner-empty"><span>空</span><h1>任务还没有步骤</h1><a href="/task/new">返回任务工坊</a></main>;

  return <main className="focus-app">
    <header className="focus-topbar">
      <a href="/" className="focus-brand"><span>叶</span><b>小步修仙</b></a>
      <nav><a href="/work">工作洞府</a><i>/</i><b>{task.title}</b></nav>
      <label><span>⌕</span><input aria-label="搜索" placeholder="搜索任务、资料、修行记录" /><kbd>⌘K</kbd></label>
      <div><button aria-label="通知">♧</button><span className="focus-avatar">山</span></div>
    </header>

    <section className="focus-hero">
      <div className="focus-title"><span className="title-seal">复杂<br />修行</span><div><h1>{task.title}</h1><p>{task.description || "把复杂目标拆成可以完成的每一步"}</p></div></div>
      <span className="running-badge">{task.status}</span>
      <div className="focus-summary"><b>{completed.length} / {steps.length} 步 · {percent}%</b><div><i style={{ width: `${percent}%` }} /></div></div>
      <div className="hero-meta"><span>截止时间<b>{task.dueDate || "未设置"}</b></span><span>预计剩余时间<b>约 {remaining} 分钟</b></span><span>任务来源<b>任务工坊</b></span></div>
    </section>

    <div className="focus-layout">
      <aside className={`step-map focus-card ${editingFlow ? "editing" : ""}`}><div className="step-map-head"><h2><span>◇</span> 修行地图</h2><button onClick={toggleFlowEditing}>{editingFlow ? "✓ 完成编辑" : "✎ 编辑流程"}</button></div><div className={`step-list ${editingFlow ? "editing" : ""}`}>{steps.map((step, index) => {
        const done = completed.includes(index); const active = currentIndex === index; const locked = !editingFlow && !done && index > completed.length;
        const stepButton = <button className={`step-select-button ${done ? "done" : ""} ${active ? "active" : ""} ${locked ? "locked" : ""}`} onClick={() => selectStep(index)} disabled={locked}><span>{done ? "✓" : locked ? "♙" : index + 1}</span><b>{index + 1}</b><em>{step.title}</em>{active && <i>当前</i>}</button>;
        return editingFlow ? <div className="step-edit-group" key={step.id}><div className={`step-edit-item ${draggedStepIndex === index ? "dragging" : ""} ${dragOverStepIndex === index ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStepIndex(index); }} onDragLeave={() => setDragOverStepIndex((value) => value === index ? null : value)} onDrop={(event) => dropStep(event, index)}>{stepButton}<span className="step-drag-handle" draggable onDragStart={(event) => beginStepDrag(event, index)} onDragEnd={() => { setDraggedStepIndex(null); setDragOverStepIndex(null); }} onKeyDown={(event) => { if (event.key === "ArrowUp" && index > 0) moveStep(index, index - 1); if (event.key === "ArrowDown" && index < steps.length - 1) moveStep(index, index + 1); }} role="button" tabIndex={0} aria-label={`拖动第 ${index + 1} 步调整顺序`} title="拖动调整顺序，或用上下方向键移动">⠿</span><button className="remove-step" onClick={() => removeStep(index)} disabled={steps.length <= 1} aria-label={`删除第 ${index + 1} 步`}>×</button></div><button className="add-step-between" onClick={() => insertStepAt(index + 1)}><span>＋</span> 在这里插入步骤</button></div> : <div className="step-view-item" key={step.id}>{stepButton}</div>;
      })}</div><div className="step-mountain">⌁ 〽 ⌁</div></aside>

      <section className="step-work focus-card">
        <header className={`step-work-head ${editingFlow ? "editing" : ""}`}>
          <div className="step-head-meta"><span>当前修行 · 第 {currentIndex + 1} 步 · 预计 {current.minutes} 分钟</span></div>
          {editingFlow ? <div className="step-head-editor">
            <label><span>步骤名称</span><input value={current.title} onChange={(event) => updateCurrentStep({ title: event.target.value })} /></label>
            <label><span>预计分钟</span><input type="number" min="1" value={current.minutes} onChange={(event) => updateCurrentStep({ minutes: Math.max(1, Number(event.target.value) || 1) })} /></label>
            <label className="step-description-field"><span>步骤说明</span><textarea value={current.description || ""} placeholder="只处理眼前这一步，完成以后再继续向前。" onChange={(event) => updateCurrentStep({ description: event.target.value })} /></label>
          </div> : <><h2>{current.title}</h2><p>{current.description || "只处理眼前这一步，完成以后再继续向前。"}</p></>}
        </header>
        <div className={`step-goal ${editingFlow ? "editing" : ""}`}><span>◎</span><b>本步目标</b>{editingFlow ? <textarea value={current.goal} onChange={(event) => updateCurrentStep({ goal: event.target.value })} aria-label="本步目标" /> : <p>{current.goal}</p>}</div>
        <div className={`step-checks ${editingFlow ? "editing" : ""}`}>{current.checklist.map((item, index) => editingFlow ? <div className="check-edit-row" key={`${current.id}-edit-${index}`}><button className={currentChecks[index] ? "checked" : ""} onClick={() => updateCheck(index)} aria-label={`切换${item}完成状态`}>{currentChecks[index] ? "✓" : ""}</button><textarea value={item} onChange={(event) => updateChecklistText(index, event.target.value)} aria-label={`检查项 ${index + 1}`} /><button className="remove-check" onClick={() => removeChecklistItem(index)} disabled={current.checklist.length <= 1} aria-label={`删除检查项 ${index + 1}`}>×</button></div> : <label key={`${current.id}-${index}`} className={currentChecks[index] ? "checked" : ""}><input type="checkbox" checked={currentChecks[index] ?? false} onChange={() => updateCheck(index)} /><span>{currentChecks[index] ? "✓" : ""}</span><em>{item}</em><small>{currentCheckRewards[index] ? "已获得" : `+${getCheckRewardXp(current)} 修为`}</small></label>)}{editingFlow && <button className="add-check-item" onClick={addChecklistItem}>＋ 添加检查项</button>}</div>
        <div className="step-editor">{currentFields.map((field, index) => <div key={`${field.label}-${index}`}><label>{field.label}<small>{index === 0 ? "关键输入" : ""}</small></label><textarea value={currentDrafts[index] ?? ""} onChange={(event) => updateDraft(index, event.target.value)} placeholder={field.placeholder} rows={index === 0 ? 5 : 3} /></div>)}</div>
        <div className="editor-tools"><div className="step-tip"><span>叶</span><p><b>修行提示</b>{current.guidance || "先完成可用版本，不必一次写到完美。"}</p></div></div>
        {error && <div className="step-error">! {error}</div>}{currentBlockers.length > 0 && <div className="blocked-note blocker-history"><b>本步卡点</b><div>{currentBlockers.map((item) => <button key={item.id} onClick={() => openBlocker(item)}><span>{item.status}</span>{item.problem}<i>编辑 ›</i></button>)}</div></div>}
        <div className="step-notes"><label><b>本步备注</b><textarea placeholder="记录想法、问题或参考信息…" /></label><div><b>附件</b><button>＋ 添加文件</button><span>暂未添加资料</span></div></div>
        <footer className="step-actions"><button className="back-step" onClick={() => selectStep(currentIndex - 1)} disabled={currentIndex === 0}>上一步</button><a href="/work" className="save-exit">暂存退出</a><button className="next-step" onClick={completeStep}>{currentIndex === steps.length - 1 ? "完成全部修行" : completed.includes(currentIndex) ? "进入下一步" : "完成本步，进入下一步"}<span>→</span></button><p>完成后将获得 <b>+{current.xp} 修为</b>{currentIndex < steps.length - 1 && <>，并解锁「{steps[currentIndex + 1].title}」</>}</p></footer>
      </section>

      <aside className="task-context">
        <section className="focus-card context-goals"><h3>◇ 任务全貌</h3><span>本周目标</span><a>{task.weeklyGoal || "暂未关联"} ›</a><span>总体目标</span><a>{task.overallGoal || "暂未关联"} ›</a></section>
        <section className="focus-card session-card"><h3>◷ 本次修行</h3><div><span><small>专注时长</small><b>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</b></span><span><small>已获得修为</small><b>{earned} 修为</b></span><span><small>已完成</small><b>{completed.length} 步</b></span></div></section>
        <section className="focus-card material-card"><h3>▱ 任务信息</h3><button>▤ 分类：{task.category}<span>›</span></button><button>▤ 共 {steps.length} 个步骤<span>›</span></button><button>▤ 创建于本机<span>›</span></button></section>
        <section className="focus-card blocker-card"><h3>遇到卡壳？</h3><p>把问题和尝试记下来，找到办法后再回来补全。</p><div><button className={unresolvedCount ? "active" : ""} onClick={() => openBlocker()}>△ 记录卡点</button><button onClick={() => currentBlockers[0] ? openBlocker(currentBlockers[0]) : openBlocker()}>▣ {blockers.length} 条记录</button></div></section>
        <section className="focus-card task-tip-card"><h3>✦ 发现新技巧？</h3><p>把已经验证的操作方法单独保存，以后不必重新摸索。</p><button onClick={openTip}>记录技巧</button><a href="/tips">查看技巧阁 · {taskTips.length} 条 ›</a></section>
        <section className="focus-card completion-badge"><div><span>完成全部 {steps.length} 步，可获得：</span><h3>任务圆满徽章</h3></div><span className="coin">成</span></section>
      </aside>
    </div>
    {reward !== null && <div className="focus-reward">修行有得 · +{reward} 修为</div>}
    {blockerOpen && <div className="knowledge-overlay" onMouseDown={() => setBlockerOpen(false)}><section className="blocker-dialog" onMouseDown={(event) => event.stopPropagation()}><header><div><span>卡</span><div><small>第 {editingBlockerId ? (blockers.find((item) => item.id === editingBlockerId)?.stepIndex ?? currentIndex) + 1 : currentIndex + 1} 步</small><h2>记录卡点与解决办法</h2></div></div><button onClick={() => setBlockerOpen(false)}>×</button></header><p className="dialog-hint">不用立刻解决。先准确描述哪里卡住，已经试过什么，之后找到办法再回来更新。</p><label><span>卡在哪里？ *</span><textarea autoFocus value={blockerForm.problem} onChange={(event) => setBlockerForm({ ...blockerForm, problem: event.target.value })} placeholder="例如：无法确定文章开头应该采用哪种结构" /></label><label><span>已经尝试过什么？</span><textarea value={blockerForm.attempted} onChange={(event) => setBlockerForm({ ...blockerForm, attempted: event.target.value })} placeholder="记录尝试、参考资料和失败现象，避免下次重复踩坑" /></label><label><span>对应的解决办法</span><textarea value={blockerForm.solution} onChange={(event) => setBlockerForm({ ...blockerForm, solution: event.target.value })} placeholder="暂时没有可以留空，找到答案后再补充" /></label><div className="blocker-status"><span>处理状态</span><button className={blockerForm.status === "待解决" ? "active" : ""} onClick={() => setBlockerForm({ ...blockerForm, status: "待解决" })}>待解决</button><button className={blockerForm.status === "已解决" ? "resolved" : ""} disabled={!blockerForm.solution.trim()} onClick={() => setBlockerForm({ ...blockerForm, status: "已解决" })}>✓ 已解决</button></div><footer><button onClick={() => setBlockerOpen(false)}>取消</button><button className="primary-btn" disabled={!blockerForm.problem.trim()} onClick={saveBlocker}>保存卡点记录</button></footer></section></div>}
    {tipOpen && <div className="knowledge-overlay" onMouseDown={() => setTipOpen(false)}><section className="tip-capture-dialog" onMouseDown={(event) => event.stopPropagation()} onPaste={(event) => { const file = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile(); if (file) setTipScreenshot(file); }}><header><div><span>诀</span><div><small>技巧沉淀</small><h2>记录一条工作技巧</h2></div></div><button onClick={() => setTipOpen(false)}>×</button></header><div className="tip-source-lock"><span>自动关联来源</span><div><b>{task.title}</b><i>第 {currentIndex + 1} 步 · {current.title}</i></div><small>导出 Obsidian 时会保留任务 ID、步骤序号和步骤名称。</small></div><p className="dialog-hint">记录“以后遇到什么情况，可以照着怎样操作”。支持直接粘贴截图。</p><div className="tip-capture-grid"><div className="tip-capture-fields"><label><span>技巧名称 *</span><input autoFocus value={tipForm.title} onChange={(event) => setTipForm({ ...tipForm, title: event.target.value })} placeholder="例如：给图片通栏添加轮播按钮" /></label><div><label><span>分类</span><select value={tipForm.category} onChange={(event) => setTipForm({ ...tipForm, category: event.target.value })}>{TIP_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label><span>适用场景</span><input value={tipForm.scenario} onChange={(event) => setTipForm({ ...tipForm, scenario: event.target.value })} placeholder="什么时候需要用到？" /></label></div><label><span>操作步骤 *</span><textarea value={tipForm.steps} onChange={(event) => setTipForm({ ...tipForm, steps: event.target.value })} placeholder={"每行写一步，例如：\n点击最下面的通栏模块\n进入设计通栏\n将效果切换为轮播"} /></label><label><span>关键提醒</span><textarea value={tipForm.note} onChange={(event) => setTipForm({ ...tipForm, note: event.target.value })} placeholder="最容易忽略或弄错的地方" /></label></div><label className={`tip-image-drop ${tipImage ? "has-image" : ""}`}><input type="file" accept="image/*" onChange={(event) => setTipScreenshot(event.target.files?.[0])} />{tipImage ? <img src={tipImage} alt="技巧截图预览" /> : <><span>图</span><b>粘贴或上传截图</b><p>截图能帮你快速找回当时的界面位置</p></>}<i>{tipImage ? "更换截图" : "选择图片"}</i></label></div><footer><a href={`/tips?task=${encodeURIComponent(task.id)}`}>先去技巧阁看看</a><button onClick={() => setTipOpen(false)}>取消</button><button className="primary-btn" disabled={!tipForm.title.trim() || !tipForm.steps.trim()} onClick={saveTip}>保存到技巧阁</button></footer></section></div>}
    {finished && <div className="knowledge-overlay"><section className="archive-dialog"><header><span className="finish-seal">成</span><div><small>任务圆满 · 知识归档</small><h2>把这次工作变成下次可用的经验</h2><p>已自动整理步骤输出和 {blockers.length} 条卡点记录，再补三项复盘即可存入 Obsidian。</p></div></header><div className="archive-summary"><span>✓ {steps.length} 步完成</span><span>△ {blockers.length} 条卡点</span><span>修 +{earned}</span></div><div className="archive-fields"><label><span>最终完成了什么？</span><textarea value={review.result} onChange={(event) => updateReview("result", event.target.value)} placeholder="写清最终交付物、结果或链接" /></label><label><span>哪些做法值得保留？</span><textarea value={review.lessons} onChange={(event) => updateReview("lessons", event.target.value)} placeholder="记录已经被实际结果验证的做法" /></label><label><span>下一步是什么？</span><textarea value={review.nextAction} onChange={(event) => updateReview("nextAction", event.target.value)} placeholder="下一次接续时最先做什么" /></label></div><div className="obsidian-target"><span>存入位置</span><b>Obsidian / 工作知识库 / 80_工作复盘</b><small>以 ai_ready: no 保存，避免未经验证的经验直接进入正式知识层。</small></div>{archiveNotice && <p className="archive-notice">{archiveNotice}</p>}<footer><a href="/work">稍后整理</a><button onClick={copyArchive}>复制 Markdown</button><button className="primary-btn" onClick={saveToObsidian}>存入 Obsidian →</button></footer></section></div>}
  </main>;
}
