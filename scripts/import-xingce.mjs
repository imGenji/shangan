/**
 * 把已下载的 xingcezhenti 转成站点静态数据：public/xingce/data + public/xingce/img
 * 用法: node scripts/import-xingce.mjs
 * 环境变量: XINGCE_ROOT（默认 .cache/xingcezhenti）、XINGCE_LIMIT、XINGCE_SKIP_IMG=1
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = process.env.XINGCE_ROOT || path.join(ROOT, ".cache/xingcezhenti");
const OUT = path.join(ROOT, "public/xingce/data");
const IMG_OUT = path.join(ROOT, "public/xingce/img");
const LIMIT = process.env.XINGCE_LIMIT ? Number(process.env.XINGCE_LIMIT) : 0;
const SKIP_IMG = process.env.XINGCE_SKIP_IMG === "1";

const MODULE_DIRS = [
  "01-政治理论",
  "02-常识判断",
  "03-言语理解与表达",
  "04-数量关系",
  "05-判断推理",
  "06-资料分析",
];
const MODULE_ORDER = MODULE_DIRS.map((d) => d.replace(/^\d+-/, ""));

/** 与 src/lib/xingce/load.ts 的 SLUG 保持一致 */
export const SLUG = {
  政治理论: "zz",
  常识判断: "cs",
  言语理解与表达: "yy",
  数量关系: "sl",
  判断推理: "pd",
  资料分析: "zl",
};

function paperId(title) {
  return crypto.createHash("sha1").update(title).digest("hex").slice(0, 12);
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([^:]+):\s*"?(.+?)"?\s*$/);
    if (kv) meta[kv[1].trim()] = kv[2].replace(/^"|"$/g, "");
  }
  return meta;
}

/** 图片用站点相对路径，页面里再用 base 前缀拼绝对地址 */
function imgPath(rel) {
  return `xingce/img/${rel.replace(/^\.\.\//, "").replace(/^90-图片\//, "")}`;
}

function rewriteHtml(html) {
  return html
    .replace(/src="(?:\.\.\/)?90-图片\/([^"]+)"/g, (_, rest) => `src="${imgPath(rest)}"`)
    .replace(/!\[[^\]]*]\((?:\.\.\/)?90-图片\/([^)]+)\)/g, (_, rest) => `<img src="${imgPath(rest)}" alt="">`);
}

function collectImages(html, set) {
  const re = /src="xingce\/img\/([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) set.add(m[1]);
}

function parseAnswer(block) {
  const m = block.match(/\*\*答案\*\*[：:]\s*([A-Z、,，\s]+)/);
  if (!m) return [];
  return [...m[1].replace(/[^A-Z]/g, "")];
}

function parseQuestionHeader(line) {
  const m = line.match(/第\s*(\d+)\s*题[\s\S]*?qid\s*(\d+)\s*[·•]\s*([^<]+)/i);
  if (!m) return null;
  return { seq: Number(m[1]), qid: m[2], type: m[3].trim() };
}

function parseOptions(block) {
  const options = [];
  const re = /^-\s*\*\*([A-Z])\*\*\.?\s*(.+)$/gm;
  let m;
  while ((m = re.exec(block))) {
    options.push({
      key: m[1],
      text: rewriteHtml(m[2].replace(/\s*✅\s*$/, "").trim()),
      correct: m[2].includes("✅"),
    });
  }
  return options;
}

function flushQuestion(chunk, materialId, questions) {
  const head = chunk.split("\n").find((l) => /第\s*\d+\s*题/.test(l) && /qid/.test(l));
  if (!head) return;
  const info = parseQuestionHeader(head);
  if (!info) return;
  const optAt = chunk.search(/\n-\s*\*\*[A-Z]\*\*/);
  const stem = optAt > 0 ? chunk.slice(0, optAt).replace(/^#+\s*第\s*\d+\s*题[^\n]*\n?/, "").trim() : "";
  const options = parseOptions(optAt > 0 ? chunk.slice(optAt) : chunk);
  const fromLine = parseAnswer(chunk);
  const fromMark = options.filter((o) => o.correct).map((o) => o.key);
  const answer = fromLine.length ? fromLine : fromMark;
  const analysis = chunk.match(/\*\*官方解析\*\*\s*\r?\n([\s\S]*?)(?:\r?\n---\s*$|\r?\n---\r?\n|$)/)?.[1]?.trim() ?? "";
  questions.push({
    qid: info.qid,
    seq: info.seq,
    type: info.type,
    kind: answer.length > 1 ? "multi" : "single",
    stemHtml: rewriteHtml(stem),
    options: options.map(({ key, text }) => ({ key, text })),
    answer,
    analysisHtml: rewriteHtml(analysis),
    materialId,
  });
}

const MAT_REF = /材料|资料|文段|文中|上文|原文|这段文字|作者|定位|表格|图形|统计图|表中|图中|根据(上|以)/;

/**
 * 上游 md 没有材料组结束标记，材料后的独立题也被挂在材料下（如数量关系整卷挂一段资料分析材料）。
 * 按"回答 a-b 题"截断，否则最多 5 题；数量关系另在首个不引用材料的题处截断。
 */
function trimMaterialGroup(group, matBody, module) {
  const range = matBody.match(/回答\s*(\d+)\s*[-—–~至到]+\s*(\d+)\s*题/);
  let keep = range ? Math.min(Math.max(Number(range[2]) - Number(range[1]) + 1, 1), 10) : 5;
  if (module === "数量关系") {
    const miss = group.findIndex((q, i) => i > 0 && !MAT_REF.test((q.stemHtml + q.analysisHtml).replace(/<[^>]+>/g, "")));
    if (miss > 0) keep = Math.min(keep, miss);
  }
  for (const q of group.slice(keep)) q.materialId = null;
}

export function parseMdFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const meta = parseFrontmatter(raw);
  const body = raw.replace(/^---[\s\S]*?---\r?\n/, "");
  const module = meta.模块 || "";
  const paperTitle = meta.试卷 || path.basename(filePath, ".md");
  const materials = [];
  const questions = [];

  for (const part of body.split(/\r?\n(?=##\s)/)) {
    if (!part.trim() || (/^#\s/.test(part) && !/^##\s/.test(part))) continue;
    if (/^##\s*材料\s*\d+/.test(part)) {
      const id = Number(part.match(/材料\s*(\d+)/)?.[1] || materials.length + 1);
      const subs = part.split(/\r?\n(?=###\s*第\s*\d+\s*题)/);
      const matBody = subs[0].replace(/^##\s*材料\s*\d+\s*\r?\n/, "").trim();
      if (matBody) materials.push({ id, html: rewriteHtml(matBody) });
      const start = questions.length;
      for (let i = 1; i < subs.length; i++) flushQuestion(subs[i], id, questions);
      trimMaterialGroup(questions.slice(start), matBody, module);
      continue;
    }
    if (/^##\s*第\s*\d+\s*题/.test(part)) flushQuestion(part, null, questions);
  }

  if (questions.length === 0) {
    const subs = body.split(/\r?\n(?=###\s*第\s*\d+\s*题)/);
    for (let i = 1; i < subs.length; i++) flushQuestion(subs[i], null, questions);
  }

  return { meta, module, paperTitle, materials, questions };
}

function assertParser() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xc-"));
  const file = path.join(dir, "t.md");
  fs.writeFileSync(
    file,
    `---
类型: "真题"
试卷: "自检卷"
地区: "国考"
年份: "2024"
模块: "资料分析"
---

# 自检卷

## 材料 1

<p><img src="../90-图片/题目图/a.png" /></p>

### 第 1 题　<sub>qid 42 · 比重</sub>

题干<img src="../90-图片/公式图/b.png" />

- **A**. 1
- **B**. 2　✅

**答案**：B

**官方解析**

因为乙。

---

## 第 2 题　<sub>qid 7 · 逻辑填空</sub>

另一题

- **A**. 甲　✅
- **B**. 乙

**答案**：A

**官方解析**

甲。
`,
  );
  const parsed = parseMdFile(file);
  fs.rmSync(dir, { recursive: true, force: true });
  const [q1, q2] = parsed.questions;
  if (parsed.questions.length !== 2) throw new Error(`自检题数 ${parsed.questions.length}`);
  if (q1.answer.join("") !== "B" || q1.materialId !== 1) throw new Error("自检材料题");
  if (!q1.stemHtml.includes("xingce/img/公式图/b.png")) throw new Error("自检图片路径");
  if (!parsed.materials[0]?.html.includes("xingce/img/题目图/a.png")) throw new Error("自检材料图");
  if (q2.kind !== "single" || q2.materialId !== null) throw new Error("自检独立题");

  const mk = (n, stem = "据材料") => Array.from({ length: n }, () => ({ stemHtml: stem, analysisHtml: "", materialId: 1 }));
  const g1 = mk(8);
  trimMaterialGroup(g1, "无题号", "判断推理");
  if (g1.filter((q) => q.materialId).length !== 5) throw new Error("自检材料组默认 5 题");
  const g2 = mk(8);
  trimMaterialGroup(g2, "根据下面资料回答96-98题。", "资料分析");
  if (g2.filter((q) => q.materialId).length !== 3) throw new Error("自检材料组题号范围");
  const g3 = [...mk(2), ...mk(3, "2.1，3.4，（ ），8.16")];
  trimMaterialGroup(g3, "x", "数量关系");
  if (g3.filter((q) => q.materialId).length !== 2) throw new Error("自检数量关系截断");
}

function copyImages(imgSet) {
  if (SKIP_IMG) return 0;
  fs.mkdirSync(IMG_OUT, { recursive: true });
  let missing = 0;
  let n = 0;
  for (const rel of imgSet) {
    const src = path.join(SRC, "90-图片", rel);
    const dest = path.join(IMG_OUT, rel);
    if (!fs.existsSync(src)) {
      missing++;
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    if (++n % 4000 === 0) console.log(`images ${n}/${imgSet.size}`);
  }
  return missing;
}

function main() {
  assertParser();
  if (!fs.existsSync(SRC)) {
    console.error(`题库目录不存在: ${SRC}`);
    process.exit(1);
  }

  /** @type {Map<string, { id: string, title: string, region: string, year: number | null, modules: Map<string, object> }>} */
  const papers = new Map();
  const imgSet = new Set();
  let fileCount = 0;
  let parseErrors = 0;
  let noAnswer = 0;
  let questionCount = 0;

  outer: for (const dir of MODULE_DIRS) {
    const full = path.join(SRC, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (!name.endsWith(".md") || name === "README.md") continue;
      if (LIMIT && fileCount >= LIMIT) break outer;
      fileCount++;
      let parsed;
      try {
        parsed = parseMdFile(path.join(full, name));
      } catch (e) {
        parseErrors++;
        console.warn("parse fail", name, e.message);
        continue;
      }
      if (!parsed.questions.length) {
        parseErrors++;
        continue;
      }
      const id = paperId(parsed.paperTitle);
      if (!papers.has(id)) {
        papers.set(id, {
          id,
          title: parsed.paperTitle,
          region: parsed.meta.地区 || "",
          year: Number(parsed.meta.年份) || null,
          modules: new Map(),
        });
      }
      const paper = papers.get(id);
      for (const q of parsed.questions) {
        questionCount++;
        if (!q.answer.length) noAnswer++;
        collectImages(q.stemHtml, imgSet);
        collectImages(q.analysisHtml, imgSet);
        q.options.forEach((o) => collectImages(o.text, imgSet));
      }
      parsed.materials.forEach((m) => collectImages(m.html, imgSet));
      paper.modules.set(parsed.module, {
        module: parsed.module,
        materials: parsed.materials,
        questions: parsed.questions,
      });
    }
  }

  const missingImg = copyImages(imgSet);
  fs.mkdirSync(path.join(OUT, "papers"), { recursive: true });

  const typeIndex = {};
  const seenQ = new Set();
  const moduleCounts = Object.fromEntries(MODULE_ORDER.map((m) => [m, 0]));
  const paperList = [];

  for (const paper of papers.values()) {
    let qCount = 0;
    const mods = [];
    for (const mod of MODULE_ORDER) {
      const slice = paper.modules.get(mod);
      if (!slice) continue;
      mods.push(mod);
      qCount += slice.questions.length;
      const slug = SLUG[mod];
      if (!slug) throw new Error(`未知模块 ${mod}`);
      fs.writeFileSync(
        path.join(OUT, "papers", `${paper.id}-${slug}.json`),
        JSON.stringify({
          paperId: paper.id,
          title: paper.title,
          region: paper.region,
          year: paper.year,
          module: mod,
          materials: slice.materials,
          questions: slice.questions,
        }),
      );
      for (const q of slice.questions) {
        if (seenQ.has(q.qid)) continue;
        seenQ.add(q.qid);
        moduleCounts[mod]++;
        (typeIndex[q.type] ||= []).push({ qid: q.qid, paperId: paper.id, module: mod });
      }
    }
    paperList.push({
      id: paper.id,
      title: paper.title,
      region: paper.region,
      year: paper.year,
      questionCount: qCount,
      modules: mods,
    });
  }

  paperList.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title, "zh"));
  const index = {
    generatedAt: new Date().toISOString(),
    stats: { papers: paperList.length, uniqueQuestions: seenQ.size, questions: questionCount, modules: moduleCounts },
    modules: MODULE_ORDER,
    papers: paperList,
    typeIndex,
  };
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));

  const report = { files: fileCount, papers: paperList.length, uniqueQuestions: seenQ.size, questionCount, parseErrors, noAnswer, missingImg, images: imgSet.size };
  console.log(JSON.stringify(report, null, 2));

  const fail =
    parseErrors > Math.max(5, fileCount * 0.05) ||
    (seenQ.size > 0 && noAnswer > seenQ.size * 0.02) ||
    (!SKIP_IMG && imgSet.size > 0 && missingImg > imgSet.size * 0.05) ||
    (!LIMIT && seenQ.size < 15000);
  if (fail) {
    console.error("自检未通过");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
