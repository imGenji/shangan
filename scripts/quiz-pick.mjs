/**
 * 文章写题前的选题器：从 2359 题里按考点/关键词筛符合的题，输出 id 清单。
 *
 * 用法：
 *   node scripts/quiz-pick.mjs --subject 民法 --points 代理 --count 10
 *   node scripts/quiz-pick.mjs --keywords 无权代理,表见代理,追认 --count 8 --json
 *   node scripts/quiz-pick.mjs --subject 民法 --points 代理 --gen-analyses   # 选题后直接调 LLM
 *
 * 选题优先级：考点精确匹配 > 题干含关键词 > 有逐选项解析 > 年份新 > 时效 fresh
 * disc 无标签题靠 keywords 召回；fadao 有标签题靠 points。
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { normStem } from "./quiz-shared.mjs";

const require = createRequire(import.meta.url);
const choices = require("../src/data/quizzes/choices.json");
const ARTICLE_DIR = new URL("../src/content/articles/", import.meta.url);

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(`--${name}`);

const subject = flag("subject");
const points = flag("points")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
const keywords =
  flag("keywords")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
const count = Number(flag("count") ?? 10);
const asJson = has("json");
const includeStale = has("include-stale");
const includeDead = has("include-dead");

/** 已在 MDX 里 embed 过的题 id，避免重复用 */
function usedIds() {
  const ids = new Set();
  if (!fs.existsSync(ARTICLE_DIR)) return ids;
  const re = /getQuiz\s*\(\s*["']([^"']+)["']\s*\)|question=\{q\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const f of fs.readdirSync(ARTICLE_DIR)) {
    if (!/\.mdx?$/.test(f)) continue;
    const text = fs.readFileSync(new URL(f, ARTICLE_DIR), "utf8");
    for (const m of text.matchAll(re)) ids.add(m[1] || m[2]);
  }
  return ids;
}

function score(q) {
  let s = 0;
  if (points.length && points.includes(q.point)) s += 100;
  if (subject && q.subject === subject) s += 20;
  if (subject && q.mod !== "未分类" && q.subject === subject) s += 5;

  const stem = q.stem ?? "";
  for (const kw of keywords) {
    if (stem.includes(kw)) s += 15;
  }
  for (const p of points) {
    if (stemMatchesPoint(stem, p)) s += 8;
  }

  if (q.analysis?.trim()) s += 10;
  if (q.freshness === "fresh") s += 6;
  if (q.freshness === "stale") s += 2;
  if (q.year) s += Math.min(q.year - 2015, 10);

  return s;
}

/** 短考点名（如「代理」）不做题干子串匹配，否则民诉/刑诉里到处都是 */
function stemMatchesPoint(stem, point) {
  return point.length >= 4 && stem.includes(point);
}

function matchesTopic(q) {
  if (points.length && q.point && points.includes(q.point)) return true;
  if (keywords.some((kw) => q.stem.includes(kw))) return true;
  if (points.some((p) => stemMatchesPoint(q.stem, p))) return true;
  // disc 无标签题：仅在有显式 keywords 时纳入
  if (q.point === "未标注" && keywords.length > 0) {
    return keywords.some((kw) => q.stem.includes(kw));
  }
  return false;
}

const used = usedIds();
let pool = choices.filter((q) => {
  if (!includeDead && q.freshness === "dead") return false;
  if (!includeStale && q.freshness === "stale") return false;
  if (used.has(q.id)) return false;
  return true;
});

// 至少要有考点匹配或关键词命中，否则噪音太大
pool = pool.filter((q) => matchesTopic(q) && score(q) >= (points.length ? 50 : 15));

pool.sort((a, b) => score(b) - score(a) || (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id));

/** 题型尽量均衡：单选/多选/不定项 */
function pickBalanced(list, n) {
  const picked = [];
  const rest = [...list];
  const want = { single: Math.ceil(n * 0.45), multi: Math.ceil(n * 0.45), indefinite: Math.max(1, n - Math.ceil(n * 0.45) * 2) };
  const have = { single: 0, multi: 0, indefinite: 0 };

  for (const kind of ["multi", "single", "indefinite"]) {
    for (let i = rest.length - 1; i >= 0 && have[kind] < want[kind] && picked.length < n; i--) {
      if (rest[i].kind === kind) {
        picked.push(rest.splice(i, 1)[0]);
        have[kind]++;
      }
    }
  }
  while (picked.length < n && rest.length) picked.push(rest.shift());
  return picked;
}

const selected = pickBalanced(pool, count);
const ids = selected.map((q) => q.id);

const result = {
  count: selected.length,
  ids,
  questions: selected.map((q) => ({
    id: q.id,
    source: q.source,
    year: q.year,
    kind: q.kind,
    mod: q.mod,
    point: q.point,
    score: score(q),
    hasAnalysis: !!q.analysis?.trim(),
    stem: q.stem.slice(0, 72) + (q.stem.length > 72 ? "…" : ""),
  })),
  needAiAnalysis: selected.filter((q) => !q.analysis?.trim()).map((q) => q.id),
  stats: {
    pool: pool.length,
    excludedUsed: used.size,
    withBankAnalysis: selected.filter((q) => q.analysis?.trim()).length,
    withoutBankAnalysis: selected.filter((q) => !q.analysis?.trim()).length,
  },
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`候选池 ${pool.length} 题（已排除文中用过的 ${used.size} 题）`);
  console.log(`选出 ${selected.length} 题：`);
  for (const q of result.questions) {
    console.log(
      `  ${q.id.padEnd(14)} ${String(q.year ?? "?").padStart(4)} ${q.kind.padEnd(11)} ` +
        `${q.hasAnalysis ? "有解析" : "无解析·需AI"} score=${q.score} ${q.stem}`,
    );
  }
  console.log(`\n无逐选项解析、建议跑 AI 解析：${result.needAiAnalysis.length} 题`);
  if (result.needAiAnalysis.length) {
    console.log(`  node scripts/gen-analyses.mjs --ids ${result.needAiAnalysis.join(",")}`);
  }
  console.log(`\n嵌入文章：`);
  console.log(`  ${ids.map((id) => `getQuiz("${id}")`).join(", ")}`);
}

if (has("gen-analyses") && result.needAiAnalysis.length) {
  if (!process.env.LLM_API_KEY) {
    console.error("\n缺少 LLM_API_KEY，跳过 AI 解析生成");
    process.exit(1);
  }
  console.log("\n── 生成 AI 解析 ──");
  const r = spawnSync(
    process.execPath,
    ["scripts/gen-analyses.mjs", "--ids", result.needAiAnalysis.join(",")],
    { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname },
  );
  process.exit(r.status ?? 1);
}
