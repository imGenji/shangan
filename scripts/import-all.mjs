/**
 * 合并多源法考题库 -> src/data/quizzes/choices.json
 *
 * 源 1  fadao（竹马/zhuma，1383 题去重，含逐选项解析 + 18 部门法标签）
 * 源 2  DISC-LawLLM NJE（复旦 DISC，2018-2022 国家司法考试真题 1000 题，仅答案无解析）
 *
 * 用法: node scripts/import-all.mjs [--skip-disc]
 * 去重规则：题干归一化相同则保留有解析、有考点标签的那条（通常留 fadao）。
 */
import fs from "node:fs";
import vm from "node:vm";
import {
  SUBJECT_OF,
  PAPER_ONE,
  KIND_OF,
  freshness,
  mergeBanks,
  tally,
} from "./quiz-shared.mjs";

const OUT = new URL("../src/data/quizzes/choices.json", import.meta.url);
const FADAO_RAW = "https://raw.githubusercontent.com/andesiwangzhiyi-alt/fadao/main/js";
const DISC_SINGLE =
  "https://raw.githubusercontent.com/FudanDISC/DISC-LawLLM/main/eval/datasets/objective/mcq_sing_nje.csv";
const DISC_MULTI =
  "https://raw.githubusercontent.com/FudanDISC/DISC-LawLLM/main/eval/datasets/objective/mcq_mult_nje.csv";

const skipDisc = process.argv.includes("--skip-disc");

async function loadFadao() {
  async function fetchBank(remote) {
    const src = await fetch(`${FADAO_RAW}/${remote}`).then((r) => {
      if (!r.ok) throw new Error(`拉取 fadao/${remote} 失败`);
      return r.text();
    });
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(
      `${src}\n;globalThis.__bank = typeof QUESTION_BANK !== "undefined" ? QUESTION_BANK : QUESTION_BANK2;`,
      ctx,
    );
    return ctx.__bank;
  }

  const out = [];
  const seen = new Set();
  for (const bank of [await fetchBank("questions.js"), await fetchBank("questions2.js")]) {
    for (const list of Object.values(bank)) {
      for (const q of list) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        const subject = SUBJECT_OF[q.mod];
        if (!subject) throw new Error(`未映射部门法: ${q.mod}`);
        const year = q.year ? Number(q.year) : null;
        out.push({
          id: String(q.id),
          source: "fadao",
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
          answer: [...q.answer].sort((a, b) => a - b).map((i) => String.fromCharCode(65 + i)),
          analysis: (q.analysis ?? "").trim(),
        });
      }
    }
  }
  return out;
}

/** 解析 DISC CSV（题干可能含换行，按引号状态切行） */
function parseDiscCsv(text) {
  const rows = [];
  let fields = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && c === ",") {
      fields.push(cur);
      cur = "";
      continue;
    }
    if (!inQ && c === "\n") {
      fields.push(cur);
      if (fields[0] && fields[0] !== "input") rows.push(fields);
      fields = [];
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur || fields.length) {
    fields.push(cur);
    if (fields[0] && fields[0] !== "input") rows.push(fields);
  }
  return rows;
}

function lettersFromAnswer(raw, multi) {
  const s = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-D]/g, "");
  const letters = [...new Set(s.split(""))].sort();
  if (!letters.length) return [];
  if (!multi && letters.length > 1) return [letters[0]];
  return letters;
}

async function loadDisc() {
  const [singleText, multiText] = await Promise.all([
    fetch(DISC_SINGLE).then((r) => r.text()),
    fetch(DISC_MULTI).then((r) => r.text()),
  ]);

  const out = [];
  let seq = 0;
  for (const [text, multi] of [
    [singleText, false],
    [multiText, true],
  ]) {
    for (const f of parseDiscCsv(text)) {
      const [stem, ans, a, b, c, d, source] = f;
      const year = Number((source?.match(/(\d{4})/) || [])[1]) || null;
      const options = [a, b, c, d]
        .map((t, i) => ({ key: String.fromCharCode(65 + i), text: String(t ?? "").trim() }))
        .filter((o) => o.text);
      if (!stem?.trim() || options.length < 2) continue;
      seq++;
      out.push({
        id: `disc-${year ?? "x"}-${String(seq).padStart(4, "0")}`,
        source: "disc-nje",
        mod: "未分类",
        subject: "未分类",
        paper: 0,
        point: "未标注",
        kind: multi ? "multi" : "single",
        year,
        freshness: freshness("未分类", "未标注", year),
        stem: stem.trim(),
        options,
        answer: lettersFromAnswer(ans, multi),
        analysis: "",
      });
    }
  }
  return out;
}

const fadao = await loadFadao();
const disc = skipDisc ? [] : await loadDisc();
const merged = mergeBanks([fadao, disc]);

fs.writeFileSync(OUT, JSON.stringify(merged));

const added = merged.length - fadao.length;
console.log(`写入 ${merged.length} 题 -> ${OUT.pathname}`);
console.log(`  fadao ${fadao.length} + disc 净增 ${added}（disc 原始 ${disc.length}，去重后并入 ${added}）`);
console.log("来源:", tally(merged, (q) => q.source).map(([k, v]) => `${k}${v}`).join(" "));
console.log("解析:", `有 ${merged.filter((q) => q.analysis).length} / 无 ${merged.filter((q) => !q.analysis).length}`);
console.log("时效:", tally(merged, (q) => q.freshness).map(([k, v]) => `${k}${v}`).join(" "));
