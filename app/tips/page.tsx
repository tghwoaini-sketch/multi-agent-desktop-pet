"use client";

import { useEffect, useMemo, useState } from "react";
import { getTipGroup, loadTipGroups, loadTips, saveTipGroups, saveTips, TIP_CATEGORIES, type WorkTip } from "../lib/tip-model";

export default function TipsPage() {
  const [tips, setTips] = useState<WorkTip[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [source, setSource] = useState("全部任务");
  const [selected, setSelected] = useState<WorkTip | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const [managingGroups, setManagingGroups] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState("");

  useEffect(() => {
    const sync = () => {
      const nextTips = loadTips();
      const nextGroups = loadTipGroups(nextTips);
      setTips(nextTips);
      setGroups(nextGroups);
      const taskId = new URLSearchParams(window.location.search).get("task");
      if (taskId) {
        setSource(taskId);
      }
    };
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  const categories = useMemo(() => ["全部", ...Array.from(new Set(tips.map((tip) => tip.category)))], [tips]);
  const sources = useMemo(() => Array.from(new Map(tips.filter((tip) => tip.taskId || tip.taskTitle).map((tip) => [tip.taskId || tip.taskTitle!, { id: tip.taskId || tip.taskTitle!, title: tip.taskTitle || "未命名任务" }])).values()), [tips]);
  const filtered = useMemo(() => tips.filter((tip) => {
    const search = `${tip.title} ${tip.category} ${tip.scenario} ${tip.note ?? ""} ${tip.steps.join(" ")}`.toLowerCase();
    const tipSource = tip.taskId || tip.taskTitle;
    return (category === "全部" || tip.category === category) && (source === "全部任务" || tipSource === source) && search.includes(query.trim().toLowerCase());
  }), [tips, query, category, source]);
  const grouped = useMemo(() => groups.map((name) => ({ name, tips: filtered.filter((tip) => getTipGroup(tip) === name) })).filter((item) => item.tips.length || (category === "全部" && source === "全部任务" && !query.trim())), [groups, filtered, category, source, query]);

  function persistTips(nextTips: WorkTip[]) {
    setTips(nextTips);
    saveTips(nextTips);
  }

  function updateTipCategory(id: string, nextCategory: string) {
    const nextTips = tips.map((tip) => tip.id === id ? { ...tip, category: nextCategory } : tip);
    persistTips(nextTips);
    setSelected((current) => current?.id === id ? { ...current, category: nextCategory } : current);
    if (category !== "全部" && !nextTips.some((tip) => tip.category === category)) setCategory("全部");
  }

  function updateTipGroup(id: string, nextGroup: string) {
    const nextTips = tips.map((tip) => tip.id === id ? { ...tip, group: nextGroup } : tip);
    persistTips(nextTips);
    setSelected((current) => current?.id === id ? { ...current, group: nextGroup } : current);
    setOpenGroups((current) => current.includes(nextGroup) ? current : [...current, nextGroup]);
  }

  function addGroup() {
    const name = newGroup.trim();
    if (!name || groups.includes(name)) return;
    const nextGroups = [...groups, name];
    setGroups(nextGroups);
    saveTipGroups(nextGroups);
    setOpenGroups((current) => [...current, name]);
    setNewGroup("");
  }

  function deleteGroup(name: string) {
    const affectedCount = tips.filter((tip) => getTipGroup(tip) === name).length;
    if (name === "未分组" && affectedCount > 0) return;
    const affected = affectedCount > 0;
    const nextTips = tips.map((tip) => getTipGroup(tip) === name ? { ...tip, group: "未分组" } : tip);
    const nextGroups = groups.filter((group) => group !== name);
    if (affected && !nextGroups.includes("未分组")) nextGroups.push("未分组");
    persistTips(nextTips);
    setGroups(nextGroups);
    saveTipGroups(nextGroups);
    setOpenGroups((current) => current.filter((group) => group !== name));
  }

  function startRenamingGroup(name: string) {
    setEditingGroup(name);
    setGroupDraft(name);
  }

  function renameGroup(oldName: string) {
    const name = groupDraft.trim();
    if (!name || (name !== oldName && groups.includes(name))) return;
    if (name === oldName) {
      setEditingGroup(null);
      return;
    }
    const nextTips = tips.map((tip) => getTipGroup(tip) === oldName ? { ...tip, group: name } : tip);
    const nextGroups = Array.from(new Set(groups.map((group) => group === oldName ? name : group)));
    persistTips(nextTips);
    setGroups(nextGroups);
    saveTipGroups(nextGroups);
    setSelected((current) => current && getTipGroup(current) === oldName ? { ...current, group: name } : current);
    setOpenGroups((current) => Array.from(new Set(current.map((group) => group === oldName ? name : group))));
    setEditingGroup(null);
    setGroupDraft("");
  }

  function toggleGroup(name: string) {
    setOpenGroups((current) => current.includes(name) ? current.filter((group) => group !== name) : [...current, name]);
  }

  return <main className="tips-app">
    <aside className="tips-sidebar">
      <a href="/" className="work-brand"><span>叶</span><strong>小步修仙</strong></a>
      <nav><a href="/"><span>日</span><div><b>日常修炼</b><small>当天的小行动</small></div></a><a href="/work"><span>工</span><div><b>工作洞府</b><small>项目与 Agent 任务</small></div></a><a href="/tips" className="active"><span>诀</span><div><b>技巧阁</b><small>工作中发现的方法</small></div><i>›</i></a></nav>
      <section><b>记录原则</b><p>只收已经实际操作过、以后可能再次用到的方法。问题本身留在卡点，验证有效的做法才进入技巧阁。</p></section>
    </aside>

    <section className="tips-space">
      <header className="work-topbar"><div><span>诀</span><div><small>KNOW-HOW</small><b>技巧阁</b></div></div><nav><a href="/work">返回工作洞府</a></nav></header>
      <div className="tips-content">
        <section className="tips-hero"><div><p>工作技巧库</p><h1>把偶然发现，变成随时可用的方法</h1><span>按任务分组折叠，需要时再展开查看。</span></div><b>{tips.length}<small> 条技巧</small></b></section>
        <section className="tips-toolbar"><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索技巧、步骤或应用场景" /></label><select value={source} onChange={(event) => setSource(event.target.value)}><option>全部任务</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><div>{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
        <div className="tips-section-title"><div><span>◇</span><h2>{category === "全部" ? "全部技巧" : category}</h2><b>{filtered.length}</b></div><div className="tips-section-actions"><button onClick={() => setManagingCategories(true)}>✎ 管理分类</button><button className="primary-group-action" onClick={() => setManagingGroups(true)}>◈ 管理分组</button></div></div>

        <section className="tip-accordion-list">{grouped.map((group) => {
          const open = openGroups.includes(group.name);
          const latest = group.tips[0]?.createdAt;
          return <article className={`tip-accordion ${open ? "open" : ""}`} key={group.name}>
            <button className="tip-accordion-head" onClick={() => toggleGroup(group.name)}><span>卷</span><div><b>{group.name}</b><small>{group.tips.length} 条技巧</small></div>{latest && <i>最近更新：{new Date(latest).toLocaleDateString("zh-CN")}</i>}<em>{open ? "⌃" : "⌄"}</em></button>
            {open && <div className="tip-accordion-body"><section className="tips-grid compact">{group.tips.map((tip) => <button key={tip.id} className={`tip-card compact ${selected?.id === tip.id ? "selected" : ""}`} onClick={() => setSelected(tip)}>
              <div className="tip-card-image">{tip.image ? <img src={tip.image} alt={`${tip.title}操作截图`} /> : <span>诀</span>}<i>{tip.verified ? "✓ 已验证" : "待验证"}</i></div>
              <div className="tip-card-body"><small>{tip.category}</small><h3>{tip.title}</h3><p>{tip.scenario || "暂未记录适用场景"}</p><div className="compact-step"><span>{typeof tip.stepIndex === "number" ? `第 ${tip.stepIndex + 1} 步` : "未关联步骤"} · {tip.stepTitle || "独立技巧"}</span><b>查看详情 ›</b></div></div>
            </button>)}</section>{group.tips.length === 0 && <div className="tips-empty compact-empty">这个分组还没有技巧</div>}</div>}
          </article>;
        })}</section>
        {grouped.length === 0 && <section className="tips-empty"><span>卷</span><h2>没有找到相关技巧</h2><p>换个关键词、分类或来源试试。</p></section>}
      </div>
    </section>

    {selected && <div className="knowledge-overlay tip-detail-overlay" onMouseDown={() => setSelected(null)}><article className="tip-detail" onMouseDown={(event) => event.stopPropagation()}><header><div><small>{selected.category} · {selected.verified ? "已经实际验证" : "等待验证"}</small><h2>{selected.title}</h2><p>{selected.scenario}</p></div><button onClick={() => setSelected(null)}>×</button></header>{selected.image && <button className="tip-detail-image" onClick={() => window.open(selected.image, "_blank")}><img src={selected.image} alt={`${selected.title}操作截图`} /><span>点击查看原图</span></button>}<section className="tip-detail-origin"><span>来源追踪</span><div><b>{selected.taskTitle || "独立记录"}</b><p>{typeof selected.stepIndex === "number" ? `第 ${selected.stepIndex + 1} 步` : "未关联步骤"} · {selected.stepTitle || "独立技巧"}</p><small>任务 ID：{selected.taskId || "无"}</small></div></section><section><h3>操作步骤</h3><ol>{selected.steps.map((step, index) => <li key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol></section>{selected.note && <aside><b>关键提醒</b><p>{selected.note}</p></aside>}<footer><span>{getTipGroup(selected)} · 完整来源将保留到 Obsidian</span><button onClick={() => setSelected(null)}>收起详情</button></footer></article></div>}

    {managingCategories && <div className="knowledge-overlay" onMouseDown={() => setManagingCategories(false)}><section className="tip-group-dialog" onMouseDown={(event) => event.stopPropagation()}><header><div><span>类</span><div><small>技巧阁管理</small><h2>管理技巧分类</h2></div></div><button onClick={() => setManagingCategories(false)}>×</button></header><p>分类用于顶部筛选，修改后立即保存。</p><div>{tips.map((tip) => { const legacy = !TIP_CATEGORIES.includes(tip.category as typeof TIP_CATEGORIES[number]); return <article key={tip.id}><div><b>{tip.title}</b><small>{getTipGroup(tip)} · {tip.stepTitle || "未关联步骤"}</small></div><label><span>所属分类</span><select value={tip.category} onChange={(event) => updateTipCategory(tip.id, event.target.value)}>{legacy && <option value={tip.category}>{tip.category}（待调整）</option>}{TIP_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></article>; })}</div><footer><button className="primary-btn" onClick={() => setManagingCategories(false)}>完成管理</button></footer></section></div>}

    {managingGroups && <div className="knowledge-overlay" onMouseDown={() => setManagingGroups(false)}><section className="tip-organize-dialog" onMouseDown={(event) => event.stopPropagation()}><header><div><span>卷</span><div><small>折叠层级</small><h2>管理技巧分组</h2></div></div><button onClick={() => setManagingGroups(false)}>×</button></header><div className="new-tip-group"><input value={newGroup} onChange={(event) => setNewGroup(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addGroup()} placeholder="输入新分组名称" /><button onClick={addGroup} disabled={!newGroup.trim() || groups.includes(newGroup.trim())}>＋ 新增分组</button></div><div className="group-manage-list">{groups.map((group) => {
      const count = tips.filter((tip) => getTipGroup(tip) === group).length;
      const renaming = editingGroup === group;
      const renameInvalid = !groupDraft.trim() || (groupDraft.trim() !== group && groups.includes(groupDraft.trim()));
      return <article key={group}>{renaming ? <div className="group-name-editor"><input autoFocus value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") renameGroup(group); if (event.key === "Escape") setEditingGroup(null); }} /><small>{renameInvalid ? "名称不能为空或重复" : `${count} 条技巧将同步更新`}</small></div> : <div><b>{group}</b><small>{count} 条技巧</small></div>}<div className="group-manage-actions">{renaming ? <><button className="save" onClick={() => renameGroup(group)} disabled={renameInvalid}>保存</button><button onClick={() => setEditingGroup(null)}>取消</button></> : <><button className="rename" onClick={() => startRenamingGroup(group)}>修改组名</button><button onClick={() => deleteGroup(group)} disabled={group === "未分组" && count > 0} title={group === "未分组" && count > 0 ? "请先把技巧移到其他分组" : ""}>删除分组</button></>}</div></article>;
    })}</div><h3>调整技巧归属</h3><div className="group-tip-list">{tips.map((tip) => <label key={tip.id}><span><b>{tip.title}</b><small>{tip.taskTitle || "独立记录"}</small></span><select value={getTipGroup(tip)} onChange={(event) => updateTipGroup(tip.id, event.target.value)}>{groups.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>)}</div><footer><small>空的“未分组”可以删除；有内容时请先调整归属。删除其他分组会把技巧移入“未分组”。</small><button className="primary-btn" onClick={() => setManagingGroups(false)}>完成管理</button></footer></section></div>}
  </main>;
}
