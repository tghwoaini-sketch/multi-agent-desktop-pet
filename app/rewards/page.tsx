"use client";

import { useEffect, useMemo, useState } from "react";
import { savePersistentValue } from "../lib/persistent-storage";
import { defaultRewards, loadRewardHistory, loadRewards, REWARD_CATEGORIES, saveRewardHistory, saveRewards, type RewardItem, type RewardRedemption } from "../lib/reward-model";

type RewardForm = { title: string; category: string; cost: string; condition: string; icon: string };

const emptyForm: RewardForm = { title: "", category: "小憩", cost: "100", condition: "", icon: "愿" };

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export default function RewardsPage() {
  const [rewards, setRewards] = useState<RewardItem[]>(defaultRewards);
  const [history, setHistory] = useState<RewardRedemption[]>([]);
  const [cultivation, setCultivation] = useState(2740);
  const [category, setCategory] = useState("全部");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RewardForm>(emptyForm);
  const [pendingReward, setPendingReward] = useState<RewardItem | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setRewards(loadRewards());
    setHistory(loadRewardHistory());
    try {
      const dashboard = JSON.parse(localStorage.getItem("xiaobu-xiuxian-state") ?? "{}");
      setCultivation(dashboard.cultivation ?? 2740);
    } catch {
      setCultivation(2740);
    }
  }, []);

  const filteredRewards = category === "全部" ? rewards : rewards.filter((reward) => reward.category === category);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthHistory = useMemo(() => history.filter((item) => item.redeemedAt.slice(0, 7) === monthKey), [history, monthKey]);
  const monthSpent = monthHistory.reduce((sum, item) => sum + item.cost, 0);
  const nextWish = useMemo(() => [...rewards].filter((item) => item.cost > cultivation).sort((a, b) => a.cost - b.cost)[0] ?? [...rewards].sort((a, b) => b.cost - a.cost)[0], [rewards, cultivation]);

  function persistRewards(nextRewards: RewardItem[]) {
    setRewards(nextRewards);
    saveRewards(nextRewards);
  }

  function openRewardForm(reward?: RewardItem) {
    if (reward) {
      setEditingId(reward.id);
      setForm({ title: reward.title, category: reward.category, cost: String(reward.cost), condition: reward.condition ?? "", icon: reward.icon });
    } else {
      setEditingId(null);
      setForm(emptyForm);
    }
    setFormOpen(true);
  }

  function saveReward() {
    const title = form.title.trim();
    const cost = Math.max(1, Math.round(Number(form.cost)));
    if (!title || !Number.isFinite(cost)) return;
    if (editingId) {
      persistRewards(rewards.map((reward) => reward.id === editingId ? { ...reward, title, category: form.category, cost, condition: form.condition.trim(), icon: form.icon.trim().slice(0, 2) || "愿" } : reward));
    } else {
      persistRewards([...rewards, { id: createId("reward"), title, category: form.category, cost, condition: form.condition.trim(), icon: form.icon.trim().slice(0, 2) || "愿", createdAt: new Date().toISOString() }]);
    }
    setFormOpen(false);
  }

  function deleteReward(reward: RewardItem) {
    if (!window.confirm(`确定删除“${reward.title}”吗？已产生的兑换记录会继续保留。`)) return;
    persistRewards(rewards.filter((item) => item.id !== reward.id));
  }

  function requestRedeem(reward: RewardItem) {
    if (cultivation < reward.cost) {
      setNotice(`修为还差 ${(reward.cost - cultivation).toLocaleString()}，继续完成任务就能兑换。`);
      window.setTimeout(() => setNotice(""), 2800);
      return;
    }
    setPendingReward(reward);
  }

  function confirmRedeem() {
    if (!pendingReward || cultivation < pendingReward.cost) return;
    const nextCultivation = cultivation - pendingReward.cost;
    const record: RewardRedemption = { id: createId("redeem"), rewardId: pendingReward.id, title: pendingReward.title, cost: pendingReward.cost, redeemedAt: new Date().toISOString() };
    const nextHistory = [record, ...history];
    try {
      const dashboard = JSON.parse(localStorage.getItem("xiaobu-xiuxian-state") ?? "{}");
      savePersistentValue("xiaobu-xiuxian-state", JSON.stringify({ ...dashboard, cultivation: nextCultivation }));
    } catch {
      savePersistentValue("xiaobu-xiuxian-state", JSON.stringify({ cultivation: nextCultivation }));
    }
    setCultivation(nextCultivation);
    setHistory(nextHistory);
    saveRewardHistory(nextHistory);
    setNotice(`已兑换“${pendingReward.title}”，愿你安心享受这份奖励。`);
    setPendingReward(null);
    window.setTimeout(() => setNotice(""), 3000);
  }

  const nextWishProgress = nextWish ? Math.min(100, Math.round((cultivation / nextWish.cost) * 100)) : 0;

  return <main className="reward-app">
    <aside className="reward-sidebar">
      <a className="reward-brand" href="/"><span>叶</span><strong>小步修仙</strong></a>
      <nav>
        <a href="/"><span>日</span>每日任务</a>
        <a href="/?view=weekly"><span>周</span>每周目标</a>
        <a href="/?view=overall"><span>总</span>总体目标</a>
        <a className="active" href="/rewards"><span>宝</span>愿望宝阁</a>
      </nav>
      <div className="reward-sidebar-art"><span>〽</span><p>“修行贵在坚持，<br />收获也值得期待。”</p></div>
    </aside>

    <section className="reward-space">
      <header className="reward-topbar"><a href="/">返回每日任务</a><span>完成任务获得修为，修为只在兑换时扣除</span></header>
      <div className="reward-content">
        <section className="reward-hero">
          <div><small>MY REWARDS</small><h1>愿望宝阁</h1><p>把修为兑换成真正想要的奖励</p></div>
          <div className="reward-balance"><small>当前修为</small><strong>{cultivation.toLocaleString()}</strong><span>修为</span></div>
          <button onClick={() => openRewardForm()}>＋ 添加奖励</button>
        </section>

        <div className="reward-layout">
          <section className="reward-main">
            <div className="reward-filters">{["全部", ...REWARD_CATEGORIES].map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="reward-grid">
              {filteredRewards.map((reward) => <article className="reward-card" key={reward.id}>
                <div className={`reward-illustration tone-${reward.category}`}><span>{reward.icon}</span></div>
                <div className="reward-card-copy"><small>{reward.category}</small><h2>{reward.title}</h2><p>{reward.condition || "随时可以兑换这份奖励"}</p></div>
                <div className="reward-cost"><span>◇</span><b>{reward.cost.toLocaleString()}</b><small>修为</small></div>
                <button className="redeem-btn" disabled={cultivation < reward.cost} onClick={() => requestRedeem(reward)}>{cultivation >= reward.cost ? "兑换" : `还差 ${(reward.cost - cultivation).toLocaleString()}`}</button>
                <footer><button onClick={() => openRewardForm(reward)}>✎ 编辑</button><button onClick={() => deleteReward(reward)}>♲ 删除</button></footer>
              </article>)}
              <button className="reward-add-card" onClick={() => openRewardForm()}><span>＋</span><b>自定义新奖励</b><small>创建属于你的专属奖励</small></button>
            </div>
          </section>

          <aside className="reward-context">
            <section><header><span>礼</span><h2>本月兑换</h2></header><div className="reward-month"><span><small>已兑换奖励</small><b>{monthHistory.length} 项</b></span><span><small>已消耗修为</small><b>{monthSpent.toLocaleString()}</b></span></div></section>
            <section><header><span>时</span><h2>最近兑换</h2></header>{history.length ? <div className="reward-history">{history.slice(0, 4).map((item) => <div key={item.id}><span><b>{item.title}</b><small>{formatHistoryDate(item.redeemedAt)}</small></span><em>-{item.cost.toLocaleString()}</em></div>)}</div> : <p className="reward-empty-history">还没有兑换记录，第一份奖励正等着你。</p>}</section>
            {nextWish && <section className="next-wish"><header><span>愿</span><h2>下一个心愿</h2></header><div className="wish-seal">{nextWish.icon}</div><b>{nextWish.title}</b><div className="wish-progress"><i style={{ width: `${nextWishProgress}%` }} /></div><p>{cultivation.toLocaleString()} / {nextWish.cost.toLocaleString()} 修为</p><small>{cultivation >= nextWish.cost ? "现在即可兑换" : `还需 ${(nextWish.cost - cultivation).toLocaleString()} 修为`}</small></section>}
          </aside>
        </div>
      </div>
    </section>

    {formOpen && <div className="reward-overlay" onMouseDown={() => setFormOpen(false)}><section className="reward-dialog" onMouseDown={(event) => event.stopPropagation()}><header><div><span>{editingId ? "改" : "新"}</span><div><small>愿望设置</small><h2>{editingId ? "编辑奖励" : "添加新奖励"}</h2></div></div><button onClick={() => setFormOpen(false)}>×</button></header><div className="reward-form"><label><span>奖励名称 *</span><input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：看一部喜欢的电影" /></label><div><label><span>分类</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{REWARD_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>兑换修为</span><input type="number" min="1" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /></label><label><span>印记</span><input maxLength={2} value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} /></label></div><label><span>兑换条件（可选）</span><textarea value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })} placeholder="例如：完成 3 次每日任务" /></label></div><footer><button onClick={() => setFormOpen(false)}>取消</button><button className="primary-btn" disabled={!form.title.trim() || Number(form.cost) < 1} onClick={saveReward}>保存奖励</button></footer></section></div>}

    {pendingReward && <div className="reward-overlay" onMouseDown={() => setPendingReward(null)}><section className="redeem-dialog" onMouseDown={(event) => event.stopPropagation()}><span>{pendingReward.icon}</span><h2>兑换“{pendingReward.title}”</h2><p>将消耗 <b>{pendingReward.cost.toLocaleString()} 修为</b>，兑换后剩余 {(cultivation - pendingReward.cost).toLocaleString()} 修为。</p><div><button onClick={() => setPendingReward(null)}>再想想</button><button className="primary-btn" onClick={confirmRedeem}>确认兑换</button></div></section></div>}
    {notice && <div className="reward-notice"><span>愿</span><p>{notice}</p></div>}
  </main>;
}
