/**
 * 批量生成「AI 解析」-> src/data/quizzes/analyses.ts
 *
 * 站点是纯静态的，Key 不能进前端，所以解析在构建前离线生成、存成静态数据，
 * 页面上的按钮只负责展开。已有条目不会重跑，脚本可反复执行、断点续跑。
 *
 * 环境变量：
 *   LLM_API_KEY   必填
 *   LLM_BASE_URL  默认 https://api.openai.com/v1
 *   LLM_MODEL     默认 gpt-4o-mini
 *
 * 用法：
 *   node scripts/gen-analyses.mjs --ids 36913,36904
 *   node scripts/gen-analyses.mjs --subject 民法 --limit 50
 *   node scripts/gen-analyses.mjs --point 代理 --force
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const choices = require("../src/data/quizzes/choices.json");
const OUT = new URL("../src/data/quizzes/analyses.ts", import.meta.url);

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(`--${name}`);

const BASE = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
const MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";
const KEY = process.env.LLM_API_KEY;
const CONCURRENCY = Number(flag("concurrency") ?? 4);

const SYSTEM = `你是中国法律职业资格考试（法考）的资深辅导老师。为给定真题写一份深度解析。

严格输出五段，每段以中括号标题开头，段间空一行，不要用 Markdown 语法：

【考点定位】一句话点明本题所在部门法、章节与具体考点。

【现行法条】引用现行有效的法律条文，格式为「《民法典》第147条：条文原文」。只引真正用得上的条文，最多三条。若你不确定条文编号，只写法律名称与条文内容，不要编造编号。

【逐项分析】对A、B、C、D每一项单独说明对错及理由，每项独立成行，以「A项正确。」或「A项错误。」开头。

【易混辨析】指出本题最容易混淆的一组概念，说清楚分界线在哪。

【同考点串联】用两三句话说明这个考点还会以什么形式出现，考生应当一并掌握什么。

要求：以现行法为准，若题目因修法而答案存疑必须明确指出；语言精确，不说套话；总字数 700 到 1100 字。`;

function prompt(q) {
  const opts = q.options.map((o) => `${o.key}. ${o.text}`).join("\n");
  const kind = { single: "单选题", multi: "多选题", indefinite: "不定项选择题" }[q.kind];
  const stale =
    q.freshness === "stale"
      ? "\n\n注意：本题为较早年份真题，规则可能已平移到新法，请以现行法条文号为准并在解析中说明。"
      : "";
  return `【${q.year ?? "年份不详"}年 ${q.mod} · ${q.point} · ${kind}】

${q.stem}

${opts}

标准答案：${q.answer.join("")}${stale}`;
}

async function askOne(q) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt(q) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${q.id}: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${q.id}: 空响应`);
  return text;
}

/** 读回已有解析，避免重跑已生成的题 */
async function readExisting() {
  if (!fs.existsSync(OUT)) return {};
  const { QUIZ_ANALYSES } = await import(OUT.href);
  return { ...QUIZ_ANALYSES };
}

function serialize(map) {
  const body = Object.entries(map)
    .map(
      ([id, e]) =>
        `  ${JSON.stringify(id)}: {\n    answer: ${JSON.stringify(e.answer)},\n` +
        `    text: \`${e.text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\`,\n  },`,
    )
    .join("\n\n");

  return `/**
 * AI 深度解析。题库自带的逐选项解析另存在 choices.json 的 analysis 字段里，
 * 这里放的是「AI 解析」按钮展开的那一层，固定五段结构：
 *   考点定位 / 现行法条 / 逐项分析 / 易混辨析 / 同考点串联
 * answer 供构建时与题库答案交叉校验，防止模型跑偏（见 scripts/check-quiz-analyses.mjs）。
 *
 * 由 scripts/gen-analyses.mjs 生成与维护，可手工修订，重跑不会覆盖已有条目。
 */
export type QuizAnalysisEntry = {
  /** 字母数组，需与题库 answer 完全一致 */
  answer: string[];
  /** 段落之间用空行分隔 */
  text: string;
};

export const QUIZ_ANALYSES: Record<string, QuizAnalysisEntry> = {
${body}
};

export function getQuizAnalysis(id: string): QuizAnalysisEntry | undefined {
  return QUIZ_ANALYSES[id];
}
`;
}

// ── 选题 ─────────────────────────────────────────────
const ids = flag("ids")?.split(",").map((s) => s.trim());
const limit = Number(flag("limit") ?? Infinity);

let pool = choices.filter((q) => q.freshness !== "dead");
if (ids) pool = choices.filter((q) => ids.includes(q.id));
if (flag("subject")) pool = pool.filter((q) => q.subject === flag("subject"));
if (flag("point")) pool = pool.filter((q) => q.point === flag("point"));

const existing = await readExisting();
if (!has("force")) pool = pool.filter((q) => !existing[q.id]);
pool = pool.slice(0, limit);

if (!pool.length) {
  console.log("没有需要生成的题（可能都已生成，加 --force 重跑）");
  process.exit(0);
}
if (!KEY) {
  console.error("缺少 LLM_API_KEY 环境变量");
  process.exit(1);
}

console.log(`待生成 ${pool.length} 题，模型 ${MODEL}，并发 ${CONCURRENCY}`);

// ── 并发跑，失败只记不中断，跑完统一落盘 ──────────────
let done = 0;
const failures = [];
const queue = [...pool];

async function worker() {
  for (let q = queue.shift(); q; q = queue.shift()) {
    try {
      existing[q.id] = { answer: q.answer, text: await askOne(q) };
      console.log(`  [${++done}/${pool.length}] ${q.id} ${q.mod}/${q.point}`);
    } catch (e) {
      failures.push(e.message);
      console.error(`  [!] ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

fs.writeFileSync(OUT, serialize(existing));
console.log(`\n已写入 ${Object.keys(existing).length} 条解析 -> ${OUT.pathname}`);
if (failures.length) console.log(`失败 ${failures.length} 题，重跑本命令即可续上`);
