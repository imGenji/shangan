import choices from "../data/quizzes/choices.json";

export type QuizOption = { key: string; text: string };
export type QuizQuestion = {
  id: string;
  exam: string;
  topic: string;
  stem: string;
  options: QuizOption[];
  answer: string;
  analysis?: string;
};

const ALL = choices as QuizQuestion[];
const BY_ID = new Map(ALL.map((q) => [q.id, q]));

/** 按 id 取题，文章 MDX 里 embed 用 */
export function getQuiz(id: string): QuizQuestion | undefined {
  return BY_ID.get(id);
}

/** 按题型随机取 n 道（构建时固定种子，避免每次 build 变题） */
export function pickByTopic(topic: string, n: number, seed = 0): QuizQuestion[] {
  const pool = ALL.filter((q) => q.topic === topic);
  const picked: QuizQuestion[] = [];
  let s = seed;
  for (let i = 0; i < n && pool.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    picked.push(pool[s % pool.length]);
  }
  return picked;
}

export const TOPIC_STATS = Object.entries(
  ALL.reduce<Record<string, number>>((acc, q) => {
    acc[q.topic] = (acc[q.topic] ?? 0) + 1;
    return acc;
  }, {}),
).sort((a, b) => b[1] - a[1]);
