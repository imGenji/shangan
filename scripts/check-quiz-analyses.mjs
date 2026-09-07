/**
 * 构建前校验：嵌入题均有解析，且解析声明的答案与题库一致
 * ponyytail: O(n) 扫描，仅覆盖 analyses.ts 已收录的题
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const choices = require("../src/data/quizzes/choices.json");
const { QUIZ_ANALYSES } = await import("../src/data/quizzes/analyses.ts");

const byId = new Map(choices.map((q) => [q.id, q]));
let failed = false;

for (const [id, entry] of Object.entries(QUIZ_ANALYSES)) {
  const q = byId.get(id);
  if (!q) {
    console.error(`[quiz-check] 题库无此 id: ${id}`);
    failed = true;
    continue;
  }
  if (entry.answer !== q.answer) {
    console.error(
      `[quiz-check] ${id} 解析 answer=${entry.answer} 与题库 ${q.answer} 不一致`,
    );
    failed = true;
  }
  if (!entry.text?.trim()) {
    console.error(`[quiz-check] ${id} 解析为空`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`quiz-check ok: ${Object.keys(QUIZ_ANALYSES).length} 条解析`);
