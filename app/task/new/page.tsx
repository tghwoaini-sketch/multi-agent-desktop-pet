"use client";

import { useEffect, useState } from "react";
import { addTaskToLibrary, exampleAgentPackage, normalizeTaskPackage, taskFromPackage, type TaskPackageV1, type TaskStep } from "../../lib/task-model";

type Mode = "manual" | "agent";

const blankStep = (index: number): TaskStep => ({
  id: `step_${index + 1}`,
  title: "",
  goal: "",
  minutes: 20,
  xp: 25,
  checklist: ["", "", ""],
  guidance: "",
});

export default function NewTaskPage() {
  const [mode, setMode] = useState<Mode>("manual");
  const [kind, setKind] = useState<"simple" | "complex">("complex");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("器道");
  const [dueDate, setDueDate] = useState("本周日");
  const [weeklyGoal, setWeeklyGoal] = useState("");
  const [overallGoal, setOverallGoal] = useState("");
  const [steps, setSteps] = useState<TaskStep[]>([blankStep(0), blankStep(1), blankStep(2)]);
  const [agentJson, setAgentJson] = useState(JSON.stringify(exampleAgentPackage, null, 2));
  const [preview, setPreview] = useState<TaskPackageV1 | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "agent") setMode("agent");
  }, []);

  function updateStep(index: number, patch: Partial<TaskStep>) {
    setSteps((current) => current.map((step, i) => i === index ? { ...step, ...patch } : step));
  }

  function updateChecklist(stepIndex: number, checkIndex: number, value: string) {
    const checklist = [...steps[stepIndex].checklist];
    checklist[checkIndex] = value;
    updateStep(stepIndex, { checklist });
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((step, i) => ({ ...step, id: `step_${i + 1}` }));
    });
  }

  function buildManualPackage(): TaskPackageV1 {
    return normalizeTaskPackage({
      schemaVersion: "xiaobu.task.v1",
      task: { title, description, type: kind, category, dueDate, weeklyGoal, overallGoal, steps: kind === "complex" ? steps : [], xp: kind === "simple" ? 20 : undefined },
    });
  }

  function savePackage(pkg: TaskPackageV1) {
    const stored = taskFromPackage(pkg);
    addTaskToLibrary(stored);
    window.location.href = stored.type === "complex" ? `/task/run?id=${encodeURIComponent(stored.id)}` : "/work";
  }

  function submitManual() {
    try {
      setError("");
      savePackage(buildManualPackage());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "任务内容不完整");
    }
  }

  function parseAgentJson(value = agentJson) {
    try {
      const pkg = normalizeTaskPackage(JSON.parse(value));
      setPreview(pkg);
      setError("");
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : "无法识别这个任务包");
    }
  }

  async function importFile(file?: File) {
    if (!file) return;
    const value = await file.text();
    setAgentJson(value);
    parseAgentJson(value);
  }

  async function copyPrompt() {
    const prompt = "请根据我的目标生成一个小步修仙复杂任务包。严格输出 xiaobu.task.v1 JSON；每个步骤包含 title、goal、minutes、xp、checklist，步骤数量控制在 3–10 个。把结果保存为 .task.json 文件，不要修改网页代码。我的目标是：";
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <main className="builder-app">
    <header className="builder-topbar">
      <a href="/" className="focus-brand"><span>叶</span><b>小步修仙</b></a>
      <nav><a href="/work">工作洞府</a><i>/</i><b>创建任务</b></nav>
      <div><span>任务工坊</span><a href="/work">退出</a></div>
    </header>

    <section className="builder-hero">
      <div><span className="title-seal">造<br />卷</span><div><p>任务工坊</p><h1>把目标变成可以开始的下一步</h1><span>你可以自己配置，也可以让 Agent 生成标准任务包后一键导入。</span></div></div>
      <ol><li className="active"><b>1</b>定义任务</li><li><b>2</b>配置步骤</li><li><b>3</b>开始修行</li></ol>
    </section>

    <div className="builder-layout">
      <aside className="builder-method focus-card">
        <h2>创建方式</h2>
        <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><span>笔</span><div><b>自己创建</b><small>适合边想边拆解</small></div><i>›</i></button>
        <button className={mode === "agent" ? "active" : ""} onClick={() => setMode("agent")}><span>灵</span><div><b>Agent 导入</b><small>粘贴或上传任务包</small></div><i>›</i></button>
        <div className="builder-principle"><b>同一套任务模型</b><p>手动创建和 Agent 导入最终都会进入同一个任务库，因此首页、目标和执行页不需要区分来源。</p></div>
      </aside>

      <section className="builder-main focus-card">
        {mode === "manual" ? <>
          <header><span>手动创建</span><h2>先定义这是什么任务</h2><p>普通任务直接勾选完成；复杂任务会生成专属步骤执行页。</p></header>
          <div className="kind-picker">
            <button className={kind === "simple" ? "active" : ""} onClick={() => setKind("simple")}><span>✓</span><div><b>普通任务</b><small>一个动作即可完成</small></div></button>
            <button className={kind === "complex" ? "active" : ""} onClick={() => setKind("complex")}><span>阶</span><div><b>复杂任务</b><small>拆成多个步骤逐一完成</small></div></button>
          </div>
          <div className="task-base-form">
            <label className="wide"><span>任务名称 *</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：完成自媒体账号冷启动" /></label>
            <label className="wide"><span>任务说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="这个任务最终要取得什么结果？" /></label>
            <label><span>任务分类</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>器道</option><option>悟道</option><option>练体</option><option>功法</option><option>灵石</option></select></label>
            <label><span>截止时间</span><input value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <label><span>关联每周目标</span><input value={weeklyGoal} onChange={(event) => setWeeklyGoal(event.target.value)} placeholder="例如：发布第一条内容" /></label>
            <label><span>关联总体目标</span><input value={overallGoal} onChange={(event) => setOverallGoal(event.target.value)} placeholder="例如：建立个人内容品牌" /></label>
          </div>

          {kind === "complex" && <section className="step-builder">
            <header><div><h3>配置执行步骤</h3><p>建议控制在 3–10 步，每一步都应该有明确完成标准。</p></div><button onClick={() => setSteps((current) => [...current, blankStep(current.length)])}>＋ 添加步骤</button></header>
            <div className="step-builder-list">{steps.map((step, index) => <article key={step.id}>
              <div className="step-builder-number"><span>{index + 1}</span><i>第 {index + 1} 步</i></div>
              <div className="step-builder-fields">
                <input value={step.title} onChange={(event) => updateStep(index, { title: event.target.value })} placeholder="步骤名称，例如：确定账号定位" />
                <input value={step.goal} onChange={(event) => updateStep(index, { goal: event.target.value })} placeholder="本步目标：完成后应得到什么结果？" />
                <div className="mini-fields"><label>预计分钟<input type="number" min="5" value={step.minutes} onChange={(event) => updateStep(index, { minutes: Number(event.target.value) })} /></label><label>奖励修为<input type="number" min="5" value={step.xp} onChange={(event) => updateStep(index, { xp: Number(event.target.value) })} /></label><label>修行提示<input value={step.guidance ?? ""} onChange={(event) => updateStep(index, { guidance: event.target.value })} placeholder="可选" /></label></div>
                <div className="checklist-builder"><span>完成检查</span>{step.checklist.map((check, checkIndex) => <input key={checkIndex} value={check} onChange={(event) => updateChecklist(index, checkIndex, event.target.value)} placeholder={`检查项 ${checkIndex + 1}`} />)}</div>
              </div>
              <div className="step-builder-actions"><button onClick={() => moveStep(index, -1)} disabled={index === 0}>↑</button><button onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1}>↓</button><button onClick={() => steps.length > 2 && setSteps((current) => current.filter((_, i) => i !== index))}>×</button></div>
            </article>)}</div>
          </section>}
          {error && <div className="builder-error">! {error}</div>}
          <footer className="builder-footer"><a href="/work">取消</a><button className="primary-btn" onClick={submitManual}>保存并开始修行 →</button></footer>
        </> : <>
          <header><span>Agent 导入</span><h2>让 Agent 帮你完成任务拆解</h2><p>Agent 生成标准 JSON 后，拖入文件或粘贴内容即可进入任务库。</p></header>
          <section className="agent-flow"><div><b>1</b><span>描述你的目标</span></div><i>→</i><div><b>2</b><span>Agent 生成任务包</span></div><i>→</i><div><b>3</b><span>导入并开始执行</span></div></section>
          <section className="agent-prompt focus-card"><div><span>给 Codex 的固定指令</span><button onClick={copyPrompt}>{copied ? "已复制" : "复制指令"}</button></div><p>请根据我的目标生成一个小步修仙复杂任务包。严格输出 <b>xiaobu.task.v1</b> JSON；每个步骤包含 title、goal、minutes、xp、checklist，步骤数量控制在 3–10 个。把结果保存为 <b>.task.json</b> 文件，不要修改网页代码。我的目标是：</p></section>
          <label className="agent-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); importFile(event.dataTransfer.files[0]); }}><input type="file" accept=".json,.task.json,application/json" onChange={(event) => importFile(event.target.files?.[0])} /><span>卷</span><b>把 Agent 生成的任务包拖到这里</b><p>或点击选择 `.task.json` / `.json` 文件</p></label>
          <div className="agent-divider"><span>也可以直接粘贴 JSON</span></div>
          <textarea className="agent-json" value={agentJson} onChange={(event) => setAgentJson(event.target.value)} spellCheck={false} />
          <button className="validate-btn" onClick={() => parseAgentJson()}>校验并预览任务包</button>
          {error && <div className="builder-error">! {error}</div>}
          {preview && <section className="import-preview"><header><div><span>校验通过</span><h3>{preview.task.title}</h3><p>{preview.task.description}</p></div><b>{preview.task.steps?.length ?? 0} 步</b></header><div>{preview.task.steps?.map((step, index) => <span key={step.id}><i>{index + 1}</i>{step.title}<small>{step.minutes} 分钟 · +{step.xp} 修为</small></span>)}</div><footer><button onClick={() => setPreview(null)}>返回修改</button><button className="primary-btn" onClick={() => savePackage(preview)}>一键导入并开始 →</button></footer></section>}
        </>}
      </section>
    </div>
  </main>;
}
