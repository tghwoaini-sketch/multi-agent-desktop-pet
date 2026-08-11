import { savePersistentValue } from "./persistent-storage";

export const TIP_LIBRARY_KEY = "xiaobu-tip-library-v1";
export const TIP_GROUPS_KEY = "xiaobu-tip-groups-v1";
export const TIP_CATEGORIES = ["网站搭建", "内容运营", "电商运营", "设计排版", "自动化工具", "数据处理", "问题排查", "其他"] as const;

export type WorkTip = {
  id: string;
  title: string;
  category: string;
  group?: string;
  scenario: string;
  steps: string[];
  note?: string;
  image?: string;
  taskId?: string;
  taskTitle?: string;
  stepIndex?: number;
  stepTitle?: string;
  createdAt: string;
  verified: boolean;
};

export const exampleTip: WorkTip = {
  id: "tip_carousel_example",
  title: "给图片通栏添加轮播按钮",
  category: "网站搭建",
  scenario: "官网图片通栏需要切换多张图片，但页面上没有轮播按钮时。",
  steps: [
    "点击页面最下面的图片通栏模块。",
    "打开右侧的「设计通栏」面板。",
    "在「设计」区域找到「效果」下拉菜单。",
    "把效果从「无」或「固定」切换为「轮播」。",
    "设置完成后，通栏下方会出现轮播切换按钮。",
  ],
  note: "关键点：不是编辑图片本身，而是选中最下面的通栏模块，在「设计通栏 → 效果」里切换为轮播。",
  image: "",
  taskId: "task_mrok47yp_gxj0zt",
  taskTitle: "企业官网搭建示例",
  stepIndex: 1,
  stepTitle: "首页首屏 Banner 搭建",
  createdAt: "2026-07-17T00:00:00.000Z",
  verified: true,
};

export function loadTips(): WorkTip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TIP_LIBRARY_KEY);
    if (!raw) return [exampleTip];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.map((item) => item?.id === exampleTip.id ? { ...item, category: item.category || "网站搭建", taskId: exampleTip.taskId, taskTitle: exampleTip.taskTitle, stepIndex: exampleTip.stepIndex, stepTitle: exampleTip.stepTitle } : item) : [exampleTip];
  } catch {
    return [exampleTip];
  }
}

export function saveTips(tips: WorkTip[]) {
  return savePersistentValue(TIP_LIBRARY_KEY, JSON.stringify(tips));
}

export function getTipGroup(tip: WorkTip) {
  return tip.group?.trim() || tip.taskTitle?.trim() || "未分组";
}

export function loadTipGroups(tips: WorkTip[] = loadTips()) {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(localStorage.getItem(TIP_GROUPS_KEY) ?? "[]");
    return Array.from(new Set([...(Array.isArray(saved) ? saved : []), ...tips.map(getTipGroup)])).filter(Boolean) as string[];
  } catch {
    return Array.from(new Set(tips.map(getTipGroup)));
  }
}

export function saveTipGroups(groups: string[]) {
  savePersistentValue(TIP_GROUPS_KEY, JSON.stringify(Array.from(new Set(groups.map((item) => item.trim()).filter(Boolean)))));
}

export async function addTip(tip: WorkTip) {
  const tips = loadTips();
  return await saveTips([tip, ...tips.filter((item) => item.id !== tip.id)]);
}

export async function imageFileToDataUrl(file: File, maxWidth = 1200, quality = 0.78): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = source;
  });
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
