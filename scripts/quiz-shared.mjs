/** 题库导入共用：科目映射、时效判定、题干归一化去重 */

export const SUBJECT_OF = {
  习近平法治思想: "理论法",
  法理学: "理论法",
  宪法: "理论法",
  中国法律史: "理论法",
  司法制度和法律职业道德: "理论法",
  刑法: "刑法",
  刑事诉讼法: "刑诉法",
  行政法与行政诉讼法: "行政法",
  民法: "民法",
  民事诉讼法与仲裁制度: "民诉法",
  商法: "商经知",
  知识产权法: "商经知",
  经济法: "商经知",
  环境与自然资源法: "商经知",
  劳动与社会保障法: "商经知",
  国际法: "三国法",
  国际私法: "三国法",
  国际经济法: "三国法",
};

export const PAPER_ONE = new Set([
  "习近平法治思想",
  "法理学",
  "宪法",
  "中国法律史",
  "司法制度和法律职业道德",
  "刑法",
  "刑事诉讼法",
  "行政法与行政诉讼法",
  "国际法",
]);

export const KIND_OF = { 单选题: "single", 多选题: "multi", 不定项: "indefinite" };

const CIVIL_GENERAL = new Set([
  "民法概述",
  "自然人",
  "法人和非法人组织",
  "民事法律行为",
  "代理",
  "诉讼时效与期间",
]);

const CIVIL_REWRITTEN = new Set([
  "结婚和离婚",
  "家庭关系和夫妻财产制",
  "收养",
  "继承概述",
  "法定继承",
  "遗嘱继承和遗赠",
  "遗产的处理",
]);

/** 题干归一化，多源去重靠它 */
export function normStem(stem) {
  return (stem ?? "")
    .replace(/[\s，。、？！,.!?"""''()（）[\]【】]/g, "")
    .toLowerCase();
}

/** 有部门法+考点时用精细规则；否则仅按年份粗判（DISC/JEC 等无标签源） */
export function freshness(mod, point, year) {
  if (!year) return "unknown";
  if (!mod || mod === "未分类" || point === "未标注") {
    if (year < 2018) return "stale";
    if (year < 2021) return "stale";
    return "fresh";
  }
  if (mod === "民法") {
    if (CIVIL_REWRITTEN.has(point)) return year < 2021 ? "dead" : "fresh";
    if (CIVIL_GENERAL.has(point)) return year < 2017 ? "stale" : "fresh";
    return year < 2021 ? "stale" : "fresh";
  }
  if (mod === "商法" && year < 2024) return "stale";
  if (mod === "刑法" && year < 2021) return "stale";
  if (year < 2019) return "stale";
  return "fresh";
}

/** 合并多源：同题干保留有解析、有考点标签的那条 */
export function mergeBanks(banks) {
  const byStem = new Map();
  const score = (q) =>
    (q.analysis?.trim() ? 4 : 0) +
    (q.point && q.point !== "未标注" ? 2 : 0) +
    (q.mod && q.mod !== "未分类" ? 1 : 0);

  for (const list of banks) {
    for (const q of list) {
      const key = normStem(q.stem);
      if (!key) continue;
      const prev = byStem.get(key);
      if (!prev || score(q) > score(prev)) byStem.set(key, q);
    }
  }
  return [...byStem.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id));
}

export function tally(list, fn) {
  return Object.entries(
    list.reduce((acc, q) => ((acc[fn(q)] = (acc[fn(q)] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);
}
