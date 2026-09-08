/**
 * 导入法考真题库 -> src/data/quizzes/choices.json
 *
 * 数据源：github.com/andesiwangzhiyi-alt/fadao（2016-2025 法考/司考真题，含逐选项解析）
 * 用法: node scripts/import-fakao.mjs [questions.js路径] [questions2.js路径]
 *   不传参则从 GitHub raw 拉取。
 */
import fs from "node:fs";
import vm from "node:vm";

const RAW = "https://raw.githubusercontent.com/andesiwangzhiyi-alt/fadao/main/js";
const OUT = new URL("../src/data/quizzes/choices.json", import.meta.url);

/** 18 部门法 -> 8 大应试科目。天数与分值都按大科算，刷题按部门法分 */
const SUBJECT_OF = {
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

/** 卷一考公法，卷二考私法。国际法在卷一，国私/国经在卷二 */
const PAPER_ONE = new Set([
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

const KIND_OF = { 单选题: "single", 多选题: "multi", 不定项: "indefinite" };

/** 民法典总则编由 2017《民法总则》原样平移，规则稳定，旧题仍可用 */
const CIVIL_GENERAL = new Set([
  "民法概述",
  "自然人",
  "法人和非法人组织",
  "民事法律行为",
  "代理",
  "诉讼时效与期间",
]);

/** 婚姻家庭编与继承编被实质改写（离婚冷静期、遗产管理人、取消公证遗嘱优先），旧题答案会错 */
const CIVIL_REWRITTEN = new Set([
  "结婚和离婚",
  "家庭关系和夫妻财产制",
  "收养",
  "继承概述",
  "法定继承",
  "遗嘱继承和遗赠",
  "遗产的处理",
]);

/**
 * 旧真题直接摆给考生会教错，导入时按「部门法 + 考点 + 年份」判时效：
 *   fresh = 可直接用；stale = 规则未变但条文号已改；dead = 答案已失效，不进正文。
 * ponytail: 年份加考点的粗判，不逐题核对法条；逐题核验留给 AI 解析阶段。
 */
function freshness(mod, point, year) {
  if (!year) return "unknown";
  if (mod === "民法") {
    if (CIVIL_REWRITTEN.has(point)) return year < 2021 ? "dead" : "fresh";
    if (CIVIL_GENERAL.has(point)) return year < 2017 ? "stale" : "fresh";
    return year < 2021 ? "stale" : "fresh"; // 合同/物权/侵权多为平移，条文号变
  }
  if (mod === "商法" && year < 2024) return "stale"; // 2024-07 公司法大修
  if (mod === "刑法" && year < 2021) return "stale"; // 刑修十一
  if (year < 2019) return "stale";
  return "fresh";
}

async function loadBank(path, remote) {
  const src = path
    ? fs.readFileSync(path, "utf8")
    : await fetch(`${RAW}/${remote}`).then((r) => {
        if (!r.ok) throw new Error(`拉取 ${remote} 失败: ${r.status}`);
        return r.text();
      });
  const ctx = {};
  vm.createContext(ctx);
  // 源文件是 `const QUESTION_BANK = {...}`，const 不挂到 context，需显式导出
  vm.runInContext(
    `${src}\n;globalThis.__bank = typeof QUESTION_BANK !== "undefined" ? QUESTION_BANK : QUESTION_BANK2;`,
    ctx,
  );
  return ctx.__bank;
}

const [p1, p2] = process.argv.slice(2);
const banks = [await loadBank(p1, "questions.js"), await loadBank(p2, "questions2.js")];

const out = [];
const seen = new Set();

for (const bank of banks) {
  for (const list of Object.values(bank)) {
    for (const q of list) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      const subject = SUBJECT_OF[q.mod];
      if (!subject) throw new Error(`未映射的部门法: ${q.mod}`);
      const year = q.year ? Number(q.year) : null;
      out.push({
        id: q.id,
        mod: q.mod,
        subject,
        paper: PAPER_ONE.has(q.mod) ? 1 : 2,
        point: q.type ?? "",
        kind: KIND_OF[q.tag] ?? "single",
        year,
        freshness: freshness(q.mod, q.type ?? "", year),
        stem: q.stem.trim(),
        options: q.options.map((text, i) => ({
          key: String.fromCharCode(65 + i),
          text: String(text).trim(),
        })),
        // 源库 answer 是 0-based 索引数组，转成字母便于展示与人工核对
        answer: [...q.answer].sort((a, b) => a - b).map((i) => String.fromCharCode(65 + i)),
        analysis: (q.analysis ?? "").trim(),
      });
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(out));

const tally = (fn) =>
  Object.entries(
    out.reduce((acc, q) => ((acc[fn(q)] = (acc[fn(q)] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);

console.log(`写入 ${out.length} 题 -> ${OUT.pathname}`);
console.log("科目:", tally((q) => q.subject).map(([k, v]) => `${k}${v}`).join(" "));
console.log("题型:", tally((q) => q.kind).map(([k, v]) => `${k}${v}`).join(" "));
console.log("时效:", tally((q) => q.freshness).map(([k, v]) => `${k}${v}`).join(" "));
