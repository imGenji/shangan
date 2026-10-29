import { withBase } from "../base";

/** 与 scripts/import-xingce.mjs 的 SLUG 保持一致 */
export const SLUG: Record<string, string> = {
  政治理论: "zz",
  常识判断: "cs",
  言语理解与表达: "yy",
  数量关系: "sl",
  判断推理: "pd",
  资料分析: "zl",
};

export type XOption = { key: string; text: string };
export type XQuestion = {
  qid: string;
  seq: number;
  type: string;
  kind: "single" | "multi";
  stemHtml: string;
  options: XOption[];
  answer: string[];
  analysisHtml: string;
  materialId: number | null;
};
export type XSlice = {
  paperId: string;
  title: string;
  region: string;
  year: number | null;
  module: string;
  materials: { id: number; html: string }[];
  questions: XQuestion[];
};
export type TypeRef = { qid: string; paperId: string; module: string };
export type PaperMeta = {
  id: string;
  title: string;
  region: string;
  year: number | null;
  questionCount: number;
  modules: string[];
};
export type XingceIndex = {
  generatedAt: string;
  stats: {
    papers: number;
    uniqueQuestions: number;
    questions: number;
    modules: Record<string, number>;
  };
  modules: string[];
  papers: PaperMeta[];
  typeIndex: Record<string, TypeRef[]>;
};

const slices = new Map<string, Promise<XSlice>>();

export async function loadIndex(): Promise<XingceIndex> {
  const res = await fetch(withBase("xingce/data/index.json"));
  if (!res.ok) throw new Error("题库索引加载失败");
  return res.json();
}

export function loadSlice(paperId: string, module: string): Promise<XSlice> {
  const key = `${paperId}:${module}`;
  let pending = slices.get(key);
  if (!pending) {
    const slug = SLUG[module];
    pending = fetch(withBase(`xingce/data/papers/${paperId}-${slug}.json`)).then((res) => {
      if (!res.ok) throw new Error("题目加载失败");
      return res.json();
    });
    slices.set(key, pending);
  }
  return pending;
}

export function materialOf(slice: XSlice, q: XQuestion): string {
  if (q.materialId == null) return "";
  return slice.materials.find((m) => m.id === q.materialId)?.html ?? "";
}

export function sameAnswer(picked: string[], answer: string[]): boolean {
  return picked.length === answer.length && answer.every((a) => picked.includes(a));
}
