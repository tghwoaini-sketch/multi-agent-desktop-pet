import { savePersistentValue } from "./persistent-storage";

export const REWARD_LIBRARY_KEY = "xiaobu-reward-library-v1";
export const REWARD_HISTORY_KEY = "xiaobu-reward-history-v1";

export const REWARD_CATEGORIES = ["小憩", "娱乐", "心愿", "成长"] as const;

export type RewardItem = {
  id: string;
  title: string;
  category: string;
  cost: number;
  condition?: string;
  icon: string;
  createdAt: string;
};

export type RewardRedemption = {
  id: string;
  rewardId: string;
  title: string;
  cost: number;
  redeemedAt: string;
};

export const defaultRewards: RewardItem[] = [
  { id: "reward_movie", title: "看一部喜欢的电影", category: "娱乐", cost: 300, condition: "完成 3 次每日任务", icon: "影", createdAt: "2026-07-19T00:00:00.000Z" },
  { id: "reward_tea", title: "喝一杯下午茶", category: "小憩", cost: 150, condition: "当天专注 45 分钟", icon: "茶", createdAt: "2026-07-19T00:00:00.000Z" },
  { id: "reward_book", title: "买一本想读的书", category: "成长", cost: 500, condition: "本周完成 5 次任务", icon: "书", createdAt: "2026-07-19T00:00:00.000Z" },
  { id: "reward_free_time", title: "周末半日自由时间", category: "小憩", cost: 800, condition: "本周专注时长达到 6 小时", icon: "闲", createdAt: "2026-07-19T00:00:00.000Z" },
  { id: "reward_travel", title: "旅行基金", category: "心愿", cost: 5000, condition: "长期积累，达成后安排一次短途旅行", icon: "游", createdAt: "2026-07-19T00:00:00.000Z" },
];

export function loadRewards(): RewardItem[] {
  if (typeof window === "undefined") return defaultRewards;
  try {
    const stored = JSON.parse(localStorage.getItem(REWARD_LIBRARY_KEY) ?? "null");
    return Array.isArray(stored) ? stored : defaultRewards;
  } catch {
    return defaultRewards;
  }
}

export function saveRewards(rewards: RewardItem[]) {
  savePersistentValue(REWARD_LIBRARY_KEY, JSON.stringify(rewards));
}

export function loadRewardHistory(): RewardRedemption[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(localStorage.getItem(REWARD_HISTORY_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveRewardHistory(history: RewardRedemption[]) {
  savePersistentValue(REWARD_HISTORY_KEY, JSON.stringify(history));
}
