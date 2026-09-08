import choices from "../data/quizzes/choices.json";

export type QuizOption = { key: string; text: string };
export type QuizKind = "single" | "multi" | "indefinite";
/** 真题相对现行法的时效，dead 表示答案已被修法推翻，不应进正文 */
export type QuizFreshness = "fresh" | "stale" | "dead" | "unknown";

export type QuizQuestion = {
  id: string;
  /** 数据来源：fadao / disc-nje / jec-qa … */
  source?: string;
  /** 18 个部门法之一；未分类源为「未分类」 */
  mod: string;
  /** 8 大应试科目之一 */
  subject: string;
  paper: number;
  /** 考点，如「民事法律行为」 */
  point: string;
  kind: QuizKind;
  year: number | null;
  freshness: QuizFreshness;
  stem: string;
  options: QuizOption[];
  /** 字母数组，多选题有多个元素 */
  answer: string[];
  /** 题库自带的逐选项解析 */
  analysis: string;
};

const ALL = choices as QuizQuestion[];
const BY_ID = new Map(ALL.map((q) => [q.id, q]));

export const KIND_LABEL: Record<QuizKind, string> = {
  single: "单选题",
  multi: "多选题",
  indefinite: "不定项",
};

export const FRESHNESS_NOTE: Partial<Record<QuizFreshness, string>> = {
  stale: "规则未变，但现行法条文号已调整，按新法条号记忆",
  dead: "该题答案已被修法推翻，仅供了解命题思路",
};

/** 按 id 取题，文章 MDX 里 embed 用 */
export function getQuiz(id: string): QuizQuestion | undefined {
  return BY_ID.get(id);
}

/**
 * 按考点取题，新题在前（同年按 id 稳定排序），保证每次构建题序一致。
 * 默认剔除答案已失效的题。
 */
export function byPoint(
  point: string,
  opts: { limit?: number; includeDead?: boolean } = {},
): QuizQuestion[] {
  const { limit, includeDead = false } = opts;
  const list = ALL.filter(
    (q) => q.point === point && (includeDead || q.freshness !== "dead"),
  ).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id));
  return limit ? list.slice(0, limit) : list;
}

/** 按考点批量取题并合并，用于一篇文章覆盖多个考点 */
export function byPoints(
  points: string[],
  opts: { includeDead?: boolean } = {},
): QuizQuestion[] {
  return points.flatMap((p) => byPoint(p, opts));
}

/** 单题满分判定：多选漏选即不得分，与法考评分规则一致 */
export function isCorrect(picked: string[], answer: string[]): boolean {
  return (
    picked.length === answer.length && answer.every((a) => picked.includes(a))
  );
}

/** 按科目取题（含未标注考点的补充题），用于专题加练 */
export function bySubject(
  subject: string,
  opts: { limit?: number; includeDead?: boolean; requireAnalysis?: boolean } = {},
): QuizQuestion[] {
  const { limit, includeDead = false, requireAnalysis = false } = opts;
  const list = ALL.filter(
    (q) =>
      q.subject === subject &&
      (includeDead || q.freshness !== "dead") &&
      (!requireAnalysis || !!q.analysis?.trim()),
  ).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id));
  return limit ? list.slice(0, limit) : list;
}

/** 有完整标签的真题（可嵌入每日文章） */
export function taggedOnly(list: QuizQuestion[]): QuizQuestion[] {
  return list.filter((q) => q.point && q.point !== "未标注" && q.mod !== "未分类");
}

export const SUBJECT_STATS = Object.entries(
  ALL.reduce<Record<string, number>>((acc, q) => {
    acc[q.subject] = (acc[q.subject] ?? 0) + 1;
    return acc;
  }, {}),
).sort((a, b) => b[1] - a[1]);
