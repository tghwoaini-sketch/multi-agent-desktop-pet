"use client";

import { useEffect, useMemo, useState } from "react";
import { savePersistentValue } from "./lib/persistent-storage";

type View = "daily" | "weekly" | "overall";
type TaskStatus = "进行中" | "待开始" | "已完成";

type Task = {
  id: number | string;
  time: string;
  title: string;
  category: string;
  status: TaskStatus;
  xp: number;
  weeklyGoal: number;
  complex?: boolean;
  stepCount?: number;
  stepProgress?: number;
  taskRef?: string;
  repeat?: "none" | "daily";
  rolloverCount?: number;
  rolledOverFrom?: string;
  archivedAt?: string;
};

type DailyLedger = {
  version: 2;
  lastDate: string;
  days: Record<string, Task[]>;
  dayXp: Record<string, number>;
  archived: Task[];
};

const DAILY_LEDGER_KEY = "xiaobu-daily-ledger-v2";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function moveDate(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function dateDistance(from: string, to: string) {
  return Math.max(1, Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000));
}

function formatDailyDate(dateKey: string, today: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${dateKey === today ? "今天 · " : ""}${date.getMonth() + 1}月${date.getDate()}日 · 周${week}`;
}

const initialTasks: Task[] = [
  { id: 1, time: "07:30", title: "完成 30 分钟力量训练", category: "练体", status: "进行中", xp: 30, weeklyGoal: 1 },
  { id: 2, time: "09:00", title: "阅读 50 分钟", category: "功法", status: "进行中", xp: 25, weeklyGoal: 2 },
  { id: 3, time: "12:00", title: "整理 10 张读书卡片", category: "悟道", status: "待开始", xp: 35, weeklyGoal: 2 },
  { id: 4, time: "15:00", title: "完成商品详情页首屏", category: "器道", status: "待开始", xp: 50, weeklyGoal: 3 },
  { id: 5, time: "18:00", title: "每日记账", category: "灵石", status: "待开始", xp: 15, weeklyGoal: 4, repeat: "daily" },
  { id: 6, time: "20:00", title: "冥想 10 分钟", category: "悟道", status: "已完成", xp: 20, weeklyGoal: 1, repeat: "daily" },
];

const weeklyGoals = [
  { id: 1, icon: "◉", title: "完成三次力量训练", note: "建立稳定运动习惯", done: 2, total: 3, color: "jade" },
  { id: 2, icon: "卷", title: "整理五十张读书卡片", note: "搭建个人知识系统", done: 32, total: 50, color: "blue" },
  { id: 3, icon: "器", title: "完成商品详情页第一版", note: "推进产品正式上线", done: 3, total: 5, color: "gold" },
  { id: 4, icon: "石", title: "完成本周财务整理", note: "保持清晰的生活账目", done: 4, total: 7, color: "violet" },
];

const overallGoals = [
  { title: "建立稳定运动习惯", stage: "第 2 阶段 · 稳定训练", progress: 58, milestone: "连续四周完成 3 次训练", icon: "山" },
  { title: "搭建个人知识系统", stage: "第 3 阶段 · 形成主题网络", progress: 72, milestone: "完成 200 张永久笔记", icon: "卷" },
  { title: "完成产品上线", stage: "第 1 阶段 · 验证核心体验", progress: 36, milestone: "交付可用的行动中心", icon: "舟" },
  { title: "学会基础吉他弹唱", stage: "第 1 阶段 · 和弦入门", progress: 24, milestone: "完整弹唱第一首歌", icon: "琴" },
];

const realms = ["练气期", "筑基期", "金丹期", "元婴期", "化神期", "炼虚期", "合体期", "大乘期"];

const categoryClass: Record<string, string> = {
  练体: "cat-jade",
  功法: "cat-blue",
  悟道: "cat-violet",
  器道: "cat-gold",
  灵石: "cat-amber",
};

export default function Home() {
  const today = localDateKey();
  const [view, setView] = useState<View>("daily");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedDate, setSelectedDate] = useState(today);
  const [ledger, setLedger] = useState<DailyLedger>({ version: 2, lastDate: today, days: {}, dayXp: {}, archived: [] });
  const [cultivation, setCultivation] = useState(2740);
  const [todayXp, setTodayXp] = useState(60);
  const [showAdd, setShowAdd] = useState(false);
  const [editingDaily, setEditingDaily] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newTaskTime, setNewTaskTime] = useState("09:00");
  const [newTaskRepeat, setNewTaskRepeat] = useState<"none" | "daily">("none");
  const [reward, setReward] = useState<{ title: string; xp: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "weekly" || requestedView === "overall") setView(requestedView);
    const saved = localStorage.getItem("xiaobu-xiuxian-state");
    try {
      const legacy = saved ? JSON.parse(saved) : {};
      const savedTasks: Task[] = (legacy.tasks ?? initialTasks).filter((task: Task) => !task.taskRef && task.id !== 7);
      const storedLedger = localStorage.getItem(DAILY_LEDGER_KEY);
      let nextLedger: DailyLedger = storedLedger ? JSON.parse(storedLedger) : { version: 2, lastDate: today, days: { [today]: savedTasks }, dayXp: { [today]: legacy.todayXp ?? 60 }, archived: [] };
      nextLedger = {
        ...nextLedger,
        days: Object.fromEntries(Object.entries(nextLedger.days).map(([date, dayTasks]) => [date, dayTasks.filter((task) => !task.taskRef)])),
        archived: (nextLedger.archived ?? []).filter((task) => !task.taskRef),
      };
      if (!nextLedger.days[today]) {
        const previousDate = nextLedger.lastDate || Object.keys(nextLedger.days).sort().at(-1) || moveDate(today, -1);
        const elapsed = dateDistance(previousDate, today);
        const previousTasks = nextLedger.days[previousDate] ?? [];
        const archived = [...(nextLedger.archived ?? [])];
        const rolledTasks = previousTasks.flatMap((task) => {
          if (task.repeat === "daily") return [{ ...task, id: `${task.id}_${today}`, status: "待开始" as TaskStatus, rolloverCount: task.status === "已完成" ? 0 : (task.rolloverCount ?? 0) + elapsed, rolledOverFrom: task.status === "已完成" ? undefined : previousDate }];
          if (task.status === "已完成") return [];
          const rolloverCount = (task.rolloverCount ?? 0) + elapsed;
          if (rolloverCount >= 3) {
            archived.push({ ...task, rolloverCount, archivedAt: today });
            return [];
          }
          return [{ ...task, id: `${task.id}_${today}`, status: "待开始" as TaskStatus, rolloverCount, rolledOverFrom: previousDate }];
        });
        nextLedger = { ...nextLedger, lastDate: today, archived, days: { ...nextLedger.days, [today]: rolledTasks }, dayXp: { ...nextLedger.dayXp, [today]: 0 } };
      }
      setLedger(nextLedger);
      setTasks(nextLedger.days[today] ?? []);
      setCultivation(legacy.cultivation ?? 2740);
      setTodayXp(nextLedger.dayXp[today] ?? 0);
    } catch {
      const fallback: DailyLedger = { version: 2, lastDate: today, days: { [today]: initialTasks }, dayXp: { [today]: 60 }, archived: [] };
      setLedger(fallback);
      setTasks(initialTasks);
    }
    setHydrated(true);
  }, [today]);

  useEffect(() => {
    if (hydrated) {
      setLedger((current) => {
        const next = { ...current, lastDate: today, days: { ...current.days, [today]: tasks }, dayXp: { ...current.dayXp, [today]: todayXp } };
        savePersistentValue(DAILY_LEDGER_KEY, JSON.stringify(next));
        return next;
      });
      savePersistentValue("xiaobu-xiuxian-state", JSON.stringify({ tasks, cultivation, todayXp }));
    }
  }, [tasks, cultivation, todayXp, hydrated, today]);

  const displayTasks = selectedDate === today ? tasks : ledger.days[selectedDate] ?? [];
  const displayXp = selectedDate === today ? todayXp : ledger.dayXp[selectedDate] ?? 0;
  const summary = useMemo(() => ({
    completed: displayTasks.filter((task) => task.status === "已完成").length,
    active: displayTasks.filter((task) => task.status === "进行中").length,
    pending: displayTasks.filter((task) => task.status === "待开始").length,
  }), [displayTasks]);

  const dailyPercent = displayTasks.length ? Math.round((summary.completed / displayTasks.length) * 100) : 0;

  function completeTask(id: number | string) {
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === "已完成") return;
    if (task.complex) {
      window.location.href = task.taskRef ? `/task/run?id=${encodeURIComponent(task.taskRef)}` : "/task/self-media";
      return;
    }
    setTasks((current) => current.map((item) => item.id === id ? { ...item, status: "已完成" } : item));
    setCultivation((value) => value + task.xp);
    setTodayXp((value) => value + task.xp);
    setReward({ title: task.title, xp: task.xp });
    window.setTimeout(() => setReward(null), 2800);
  }

  function addTask() {
    const title = newTask.trim();
    if (!title) return;
    setTasks((current) => [
      ...current.filter((task) => task.status !== "已完成"),
      { id: Date.now(), time: newTaskTime || "待定", title, category: "悟道", status: "待开始", xp: 20, weeklyGoal: 2, repeat: newTaskRepeat },
      ...current.filter((task) => task.status === "已完成"),
    ]);
    setNewTask("");
    setNewTaskTime("09:00");
    setNewTaskRepeat("none");
    setShowAdd(false);
  }

  function updateTask(id: number | string, patch: Partial<Pick<Task, "time" | "title" | "repeat">>) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  }

  function deleteTask(id: number | string) {
    setTasks((current) => current.filter((task) => task.id !== id));
  }

  function restoreArchived(id: number | string) {
    const archivedTask = ledger.archived.find((task) => task.id === id);
    if (!archivedTask) return;
    setTasks((current) => [{ ...archivedTask, id: `${archivedTask.id}_restore_${Date.now()}`, status: "待开始", rolloverCount: 0, rolledOverFrom: undefined, archivedAt: undefined }, ...current]);
    setLedger((current) => ({ ...current, archived: current.archived.filter((task) => task.id !== id) }));
  }

  const pageTitle = view === "daily" ? "每日任务" : view === "weekly" ? "每周目标" : "总体目标";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">叶</span><strong>小步修仙</strong></div>

        <section className="side-section">
          <div className="side-label"><span>⌁</span> 目标视图</div>
          <nav className="view-nav" aria-label="目标视图">
            <button className={view === "daily" ? "active" : ""} onClick={() => setView("daily")}><span className="seal">日</span>每日任务<i>›</i></button>
            <button className={view === "weekly" ? "active" : ""} onClick={() => setView("weekly")}><span className="seal">周</span>每周目标<i>›</i></button>
            <button className={view === "overall" ? "active" : ""} onClick={() => setView("overall")}><span className="seal">总</span>总体目标<i>›</i></button>
          </nav>
        </section>

        <section className="side-section work-entry">
          <div className="side-label"><span>⌁</span> 工作空间</div>
          <a href="/work"><span className="seal">工</span><div><b>工作洞府</b><small>项目与 Agent 任务</small></div><i>›</i></a>
        </section>

        <section className="side-section today-quick">
          <div className="side-label"><span>⌁</span> 今日任务</div>
          <div className="quick-list">
            {tasks.slice(0, 5).map((task, index) => (
              <button key={task.id} onClick={() => setView("daily")} className={task.status === "已完成" ? "done" : ""}>
                <span>{index + 1}</span><b>{task.title.replace(/完成 |每日/g, "")}</b><i>{task.status === "已完成" ? "✓" : "○"}</i>
              </button>
            ))}
          </div>
        </section>

        <div className="side-spacer" />
        <nav className="utility-nav">
          <a href="/work"><span>❧</span>工作洞府</a>
          <a href="/rewards"><span>宝</span>愿望宝阁</a>
          <button><span>▥</span>成长记录</button>
          <button><span>▮</span>收藏模板</button>
        </nav>
        <div className="mountain-art"><span>〽</span><span>⌇</span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <p><span>☘</span> 下午好，今日亦是精进修行的一天 <span>☘</span></p>
          <label className="search"><span>⌕</span><input aria-label="搜索" placeholder="搜索任务、目标或灵感" /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><button aria-label="消息">♧</button><button aria-label="通知">♢</button><button className="avatar" aria-label="个人中心">人</button></div>
        </header>

        <div className="content-layout">
          <section className="content-main">
            <div className="page-heading">
              <div><span className="heading-ornament">◈</span><h1>{pageTitle}</h1><span className="cloud-line">⌁</span></div>
              {view === "daily" && selectedDate === today && <div className="daily-heading-actions">{editingDaily && <button onClick={() => setShowAdd(true)}>＋ 添加任务</button>}<button className="primary-btn" onClick={() => setEditingDaily((value) => !value)}>{editingDaily ? "✓ 完成管理" : "✎ 管理今日任务"}</button></div>}
            </div>

            {view === "daily" && (
              <DailyView tasks={displayTasks} summary={summary} percent={dailyPercent} date={selectedDate} today={today} dayXp={displayXp} editing={editingDaily && selectedDate === today} archived={ledger.archived} onPrevious={() => { setEditingDaily(false); setSelectedDate(moveDate(selectedDate, -1)); }} onNext={() => { setEditingDaily(false); setSelectedDate(moveDate(selectedDate, 1)); }} onComplete={completeTask} onUpdate={updateTask} onDelete={deleteTask} onRestoreArchived={restoreArchived} onOpenComplex={(task) => { window.location.href = task.taskRef ? `/task/run?id=${encodeURIComponent(task.taskRef)}` : "/task/self-media"; }} />
            )}
            {view === "weekly" && <WeeklyView />}
            {view === "overall" && <OverallView />}
          </section>

          <GrowthRail cultivation={cultivation} todayXp={displayXp} completed={summary.completed} historical={selectedDate !== today} />
        </div>
      </section>

      {showAdd && (
        <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}>
          <section className="add-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-title">
            <span className="modal-seal">新</span>
            <h2 id="add-title">添加今日修行</h2>
            <p>把下一步写得具体一点，更容易开始。</p>
            <label className="add-task-field"><span>任务名称</span><input autoFocus value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTask()} placeholder="例如：整理 10 张读书卡片" /></label>
            <label className="add-task-field"><span>开始时间</span><input type="time" value={newTaskTime} onChange={(event) => setNewTaskTime(event.target.value)} /></label>
            <label className="add-task-field"><span>重复方式</span><select value={newTaskRepeat} onChange={(event) => setNewTaskRepeat(event.target.value as "none" | "daily")}><option value="none">仅今天</option><option value="daily">每天重复</option></select></label>
            <div className="modal-actions"><button onClick={() => setShowAdd(false)}>取消</button><button className="primary-btn" onClick={addTask}>加入今日任务</button></div>
          </section>
        </div>
      )}

      {reward && <div className="reward-toast"><span>修</span><div><b>修行有得 · +{reward.xp} 修为</b><p>{reward.title} 已完成</p></div></div>}
    </main>
  );
}

function DailyView({ tasks, summary, percent, date, today, dayXp, editing, archived, onPrevious, onNext, onComplete, onUpdate, onDelete, onRestoreArchived, onOpenComplex }: { tasks: Task[]; summary: { completed: number; active: number; pending: number }; percent: number; date: string; today: string; dayXp: number; editing: boolean; archived: Task[]; onPrevious: () => void; onNext: () => void; onComplete: (id: number | string) => void; onUpdate: (id: number | string, patch: Partial<Pick<Task, "time" | "title" | "repeat">>) => void; onDelete: (id: number | string) => void; onRestoreArchived: (id: number | string) => void; onOpenComplex: (task: Task) => void }) {
  const sorted = [...tasks].sort((a, b) => Number(a.status === "已完成") - Number(b.status === "已完成"));
  const historical = date !== today;
  return (
    <>
      <div className="date-row"><button onClick={onPrevious} aria-label="前一天">‹</button><b>{formatDailyDate(date, today)}</b><button onClick={onNext} disabled={date >= today} aria-label="后一天">›</button><span>{historical ? `历史修行记录 · 获得 ${dayXp} 修为` : "今日每一步，都算数"}</span></div>
      <section className="daily-overview parchment-card">
        <div className="progress-ring" style={{ "--progress": `${percent * 3.6}deg` } as React.CSSProperties}><div><strong>{percent}%</strong><span>{historical ? "当日进度" : "今日进度"}</span></div></div>
        <Stat icon="✓" label="已完成" value={summary.completed} tone="jade" />
        <Stat icon="◉" label="进行中" value={summary.active} tone="blue" />
        <Stat icon="◇" label="待开始" value={summary.pending} tone="gold" />
        <Stat icon="◆" label="总任务" value={tasks.length} tone="ink" />
      </section>
      <RealmPath />
      <section className={`task-table parchment-card ${editing ? "editing" : ""}`}>
        <div className="table-head"><span></span><span>时间</span><span>任务</span><span>推进目标</span><span>分类</span><span>状态</span><span>修为</span>{editing && <span>删除</span>}</div>
        {sorted.map((task) => (
          <div className={`task-row ${task.status === "已完成" ? "completed" : ""}`} key={task.id}>
            <button className={`check-btn ${task.complex ? "complex-check" : ""}`} aria-label={task.complex ? `进入 ${task.title}` : `完成 ${task.title}`} onClick={() => onComplete(task.id)} disabled={historical}>{task.status === "已完成" ? "✓" : task.complex ? "›" : ""}</button>
            {editing ? <input className="task-time-input" type="time" value={task.time === "待定" ? "" : task.time} onChange={(event) => onUpdate(task.id, { time: event.target.value || "待定" })} aria-label={`${task.title}的时间`} /> : <span className="task-time">{task.time}</span>}
            {editing ? <div className="task-title-edit"><input className="task-title-input" value={task.title} onChange={(event) => onUpdate(task.id, { title: event.target.value })} aria-label="任务名称" /><select value={task.repeat ?? "none"} onChange={(event) => onUpdate(task.id, { repeat: event.target.value as "none" | "daily" })}><option value="none">仅当天</option><option value="daily">每天重复</option></select></div> : task.complex ? <button className="complex-task-link" onClick={() => onOpenComplex(task)}><b>{task.title}</b><small>复杂任务 · {task.stepProgress ?? 0} / {task.stepCount} 步</small></button> : <div className="task-title-view"><b>{task.title}</b><small>{task.repeat === "daily" && <i className="repeat-badge">日课</i>}{Boolean(task.rolloverCount) && <i className="rollover-badge">顺延 {task.rolloverCount} 天</i>}</small></div>}
            <span className="goal-link">{task.weeklyGoal === 1 ? "运动习惯" : task.weeklyGoal === 2 ? "知识系统" : task.weeklyGoal === 3 ? "产品上线" : "生活秩序"}</span>
            <span><i className={`category ${categoryClass[task.category]}`}>{task.category}</i></span>
            <span><i className={`status ${task.status === "进行中" ? "active" : task.status === "已完成" ? "done" : "pending"}`}>● {task.status}</i></span>
            <span className="xp">+{task.xp}</span>
            {editing && <button className="delete-daily-task" onClick={() => onDelete(task.id)} aria-label={`删除 ${task.title}`}>×</button>}
          </div>
        ))}
        {tasks.length === 0 && <div className="daily-empty"><span>空</span><b>{historical ? "这天没有修行记录" : "今天还没有安排任务"}</b></div>}
        <div className="table-foot">共 {tasks.length} 项 · 已完成 {summary.completed} · 进行中 {summary.active} · 待开始 {summary.pending}</div>
      </section>
      {!historical && archived.length > 0 && <details className="daily-archive parchment-card"><summary>搁置阁 · {archived.length} 个连续顺延的任务</summary><div>{archived.map((task) => <article key={task.id}><div><b>{task.title}</b><span>已顺延 {task.rolloverCount ?? 3} 天 · 原定 {task.time}</span></div><button onClick={() => onRestoreArchived(task.id)}>恢复到今天</button></article>)}</div></details>}
    </>
  );
}

function WeeklyView() {
  const total = weeklyGoals.reduce((sum, item) => sum + item.total, 0);
  const done = weeklyGoals.reduce((sum, item) => sum + item.done, 0);
  const percent = Math.round((done / total) * 100);
  return (
    <>
      <div className="date-row"><button>‹</button><b>本周 · 7月13日—7月19日</b><button>›</button><span>以一周为尺，看见真正的推进</span></div>
      <section className="week-hero parchment-card">
        <div><span className="eyebrow">本周修行进度</span><strong>{percent}%</strong><p>4 个目标正在稳步推进，已有 2 个接近完成。</p></div>
        <div className="week-chart"><div style={{ width: `${percent}%` }} /><span>{done} / {total} 个关键行动</span></div>
        <div className="week-days">{["一", "二", "三", "四", "五", "六", "日"].map((day, i) => <span key={day} className={i < 5 ? "done" : ""}>{day}<i>{i < 5 ? "✓" : "·"}</i></span>)}</div>
      </section>
      <div className="section-title"><div><b>本周目标</b><span>每日行动会自动汇入对应目标</span></div><button>＋ 新建周目标</button></div>
      <section className="goal-grid">
        {weeklyGoals.map((goal) => {
          const progress = Math.round((goal.done / goal.total) * 100);
          return <article className="weekly-goal parchment-card" key={goal.id}>
            <header><span className={`goal-icon ${goal.color}`}>{goal.icon}</span><div><h3>{goal.title}</h3><p>{goal.note}</p></div><button>•••</button></header>
            <div className="goal-numbers"><strong>{goal.done}</strong><span>/ {goal.total}</span><em>{progress}%</em></div>
            <div className="thin-progress"><i style={{ width: `${progress}%` }} /></div>
            <footer><span>关联 {goal.total} 个每日任务</span><b>查看行动 ›</b></footer>
          </article>;
        })}
      </section>
      <div className="weekly-note parchment-card"><span>签</span><div><b>本周一句</b><p>目标不求多，重要的是让每天的行动都朝同一个方向积累。</p></div></div>
    </>
  );
}

function OverallView() {
  return (
    <>
      <div className="date-row"><b>长期修行图谱</b><span>方向清晰，脚下的每一步才有意义</span></div>
      <section className="vision-hero parchment-card">
        <div><span className="eyebrow">当前主线</span><h2>成为一个持续创造、身心稳定的人</h2><p>由 4 个长期目标、12 个阶段目标与每天的具体行动共同推进。</p></div>
        <div className="vision-score"><strong>48%</strong><span>总体进度</span></div>
      </section>
      <section className="overall-list">
        {overallGoals.map((goal, index) => (
          <article className="overall-card parchment-card" key={goal.title}>
            <span className="overall-icon">{goal.icon}</span>
            <div className="overall-copy"><span>长期目标 {String(index + 1).padStart(2, "0")}</span><h3>{goal.title}</h3><p>{goal.stage}</p></div>
            <div className="overall-progress"><div><i style={{ width: `${goal.progress}%` }} /></div><b>{goal.progress}%</b></div>
            <div className="milestone"><span>下一里程碑</span><b>{goal.milestone}</b></div>
            <button>查看目标 ›</button>
          </article>
        ))}
      </section>
      <section className="recent-steps parchment-card"><header><b>近期推进</b><span>过去 14 天</span></header><div className="step-bars">{[28,45,32,66,52,74,48,82,64,88,70,76,92,68].map((n, i) => <i key={i} style={{ height: `${n}%` }} />)}</div><p>你的长期目标在最近两周持续前进，其中“个人知识系统”推进最快。</p></section>
    </>
  );
}

function Stat({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return <div className="stat"><span className={tone}>{icon}</span><div><small>{label}</small><strong>{value}</strong><i>项</i></div></div>;
}

function RealmPath() {
  return <section className="realm-path parchment-card">
    <div className="realm-title"><span>修<br />行<br />境<br />界</span></div>
    <div className="realm-track">
      <div className="realm-nodes">
        {realms.map((realm, index) => <div key={realm} className={index === 1 ? "current" : index < 1 ? "passed" : ""}><span>{index === 1 ? "筑" : index + 1}</span><b>{realm}</b></div>)}
      </div>
      <div className="realm-caption"><span>当前境界：<b>筑基中期</b> · 距离金丹期还需 2,260 修为</span><div><i /></div></div>
    </div>
  </section>;
}

function GrowthRail({ cultivation, todayXp, completed, historical = false }: { cultivation: number; todayXp: number; completed: number; historical?: boolean }) {
  const percentage = Math.min(100, Math.round((cultivation / 5000) * 100));
  return <aside className="growth-rail">
    <section className="realm-card parchment-card">
      <header><h2>我的境界</h2><button>?</button></header>
      <div className="realm-medallion"><span>筑</span></div>
      <div className="realm-copy"><h3>筑基中期</h3><p>{cultivation.toLocaleString()} / 5,000 修为</p><div className="thin-progress"><i style={{ width: `${percentage}%` }} /></div></div>
      <footer>距离金丹期还需 <b>{Math.max(0, 5000 - cultivation).toLocaleString()}</b> 修为</footer>
    </section>
    <section className="streak-card parchment-card"><header><h3>连续修行 5 天</h3><span>♨</span></header><div>{[1,2,3,4,5].map((day) => <i key={day}><b>✓</b><span>{day}</span></i>)}</div><p>明日继续，即将刷新个人记录</p></section>
    <section className="harvest-card parchment-card"><h3>{historical ? "当日收获" : "今日收获"}</h3><div><span><i>✓</i><small>已完成</small><b>{completed} 项</b></span><span><i>♨</i><small>修为</small><b>+{todayXp}</b></span><span><i>◷</i><small>专注</small><b>42 分钟</b></span></div></section>
    <a className="reward-entry-card parchment-card" href="/rewards"><div><span>把修为兑换成真正想要的奖励</span><h3>进入愿望宝阁</h3><small>新增、编辑并兑换你的专属奖励</small></div><div className="reward-entry-seal">愿</div><b>查看奖励 ›</b></a>
    <p className="rail-quote">“不积跬步，无以至千里。”</p>
  </aside>;
}
