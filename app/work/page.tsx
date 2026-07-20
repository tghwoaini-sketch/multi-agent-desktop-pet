"use client";

import { useEffect, useMemo, useState } from "react";
import { ensureSelfMediaTask, ensureWebsiteTask, SELF_MEDIA_TASK_ID, type StoredTask } from "../lib/task-model";

type WorkItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  dueDate: string;
  status: "待开始" | "进行中" | "已完成";
  steps: number;
  completed: number;
  nextStep: string;
  xp: number;
  href: string;
  source: "Agent" | "手动" | "示例项目";
  blockers: number;
};

function libraryItem(task: StoredTask): WorkItem {
  const completed = task.progress?.completed.length ?? (task.status === "已完成" ? 1 : 0);
  const steps = task.type === "complex" ? task.steps?.length ?? 0 : 1;
  const nextIndex = task.progress?.current ?? 0;
  return {
    id: task.id,
    title: task.title,
    description: task.description || "按计划推进并交付明确结果。",
    category: task.category || "器道",
    dueDate: task.dueDate || "未设截止时间",
    status: task.status,
    steps,
    completed,
    nextStep: task.status === "已完成" ? "项目已经圆满完成" : task.type === "complex" ? task.steps?.[nextIndex]?.title || "继续下一步" : "完成任务并确认结果",
    xp: task.xp || 20,
    href: task.type === "complex" ? `/task/run?id=${encodeURIComponent(task.id)}` : "/work",
    source: task.id === SELF_MEDIA_TASK_ID ? "示例项目" : "Agent",
    blockers: task.blockers?.filter((item) => item.status === "待解决").length ?? 0,
  };
}

export default function WorkPage() {
  const [library, setLibrary] = useState<StoredTask[]>([]);
  function sync() {
    ensureSelfMediaTask();
    setLibrary(ensureWebsiteTask().filter((task) => (task.workspace ?? "work") === "work"));
  }

  useEffect(() => {
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  const items = useMemo<WorkItem[]>(() => {
    return library.map(libraryItem);
  }, [library]);

  const active = items.filter((item) => item.status !== "已完成");
  const completed = items.filter((item) => item.status === "已完成");
  const totalSteps = items.reduce((sum, item) => sum + item.steps, 0);
  const doneSteps = items.reduce((sum, item) => sum + item.completed, 0);

  return <main className="work-app">
    <aside className="work-sidebar">
      <a href="/" className="work-brand"><span>叶</span><strong>小步修仙</strong></a>
      <nav>
        <a href="/"><span>日</span><div><b>日常修炼</b><small>当天的小行动</small></div></a>
        <a href="/work" className="active"><span>工</span><div><b>工作洞府</b><small>项目与 Agent 任务</small></div><i>›</i></a>
        <a href="/tips"><span>诀</span><div><b>技巧阁</b><small>随时回看操作方法</small></div></a>
      </nav>
      <section><b>这里管理什么？</b><p>需要多步骤推进、有明确交付结果的工作任务。它们不会再挤进每日任务列表。</p></section>
      <div className="work-sidebar-foot">工作修行所得修为<br />仍会计入共同境界</div>
    </aside>

    <section className="work-space">
      <header className="work-topbar"><div><span>工</span><div><small>WORKSPACE</small><b>工作洞府</b></div></div><nav><a href="/tips">技巧阁</a><a href="/">返回日常</a><a href="/task/new?mode=agent" className="primary-btn">＋ Agent 导入</a></nav></header>
      <div className="work-content">
        <section className="work-welcome">
          <div><p>今日工作修行</p><h1>一次只推进一个项目的下一步</h1><span>这里收纳需要持续推进的工作。进入项目后，系统会带你一步一步完成。</span></div>
          <a href="/task/new">＋ 新建工作任务</a>
        </section>

        <section className="work-stats">
          <div><span>进行中的项目</span><b>{active.length}</b><small>项</small></div>
          <div><span>全部执行步骤</span><b>{doneSteps}<i> / {totalSteps}</i></b><small>步</small></div>
          <div><span>已完成项目</span><b>{completed.length}</b><small>项</small></div>
          <div className="work-stat-focus"><span>工作区原则</span><p>不堆任务，只显示每个项目当前最该做的一步。</p></div>
        </section>

        <div className="work-section-title"><div><span>◈</span><h2>进行中的项目</h2><b>{active.length}</b></div><p>选择一个项目，继续上次的进度</p></div>
        <section className="work-projects">
          {active.map((item) => {
            const percent = item.steps ? Math.round(item.completed / item.steps * 100) : 0;
            return <article key={item.id} className="work-project-card">
              <header><span>{item.category.slice(0, 1)}</span><div><small>{item.source} · {item.category}</small><h3>{item.title}</h3></div><i className={item.blockers ? "has-blocker" : ""}>{item.blockers ? `△ ${item.blockers} 个卡点` : item.status}</i></header>
              <p>{item.description}</p>
              <div className="work-next"><small>下一步</small><b>{item.nextStep}</b></div>
              <div className="work-project-progress"><div><i style={{ width: `${percent}%` }} /></div><span>{item.completed} / {item.steps} 步</span><b>{percent}%</b></div>
              <footer><span>截止：{item.dueDate}</span><span>共 +{item.xp} 修为</span><a href={item.href}>继续推进 <b>→</b></a></footer>
            </article>;
          })}
          <a href="/task/new?mode=agent" className="work-import-card"><span>灵</span><h3>让 Agent 拆解新项目</h3><p>描述目标，生成标准任务包后直接导入。</p><b>导入任务包 →</b></a>
        </section>

        {completed.length > 0 && <><div className="work-section-title completed-title"><div><span>✓</span><h2>已完成</h2><b>{completed.length}</b></div></div><section className="work-completed">{completed.map((item) => <a key={item.id} href={item.href}><span>✓</span><div><b>{item.title}</b><small>{item.steps} 步全部完成 · +{item.xp} 修为</small></div><i>查看 ›</i></a>)}</section></>}
      </div>
    </section>
  </main>;
}
