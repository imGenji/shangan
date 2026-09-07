/**
 * 从 gitee.com/liyifm/aishangan 的 data.json 解析选择题
 * 用法: node scripts/import-aishangan.mjs [data.json路径]
 */
import fs from "node:fs";

const SRC = process.argv[2] ?? "/tmp/aishangan.json";
const OUT = new URL("../src/data/quizzes/choices.json", import.meta.url);

/** 把「选项列表：A、xxB、yy…」拆成 stem + options */
function parseContent(raw) {
  const marker = "选项列表：";
  const i = raw.indexOf(marker);
  if (i === -1) return { stem: raw.trim(), options: [] };

  const stem = raw.slice(0, i).trim();
  const optText = raw.slice(i + marker.length);
  const options = [];
  const re = /([A-D])、([^A-D]*)/g;
  let m;
  while ((m = re.exec(optText))) {
    options.push({ key: m[1], text: m[2].trim() });
  }
  return { stem, options };
}

const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
const out = [];

for (const exam of data.exams) {
  for (const q of exam.questions) {
    const { stem, options } = parseContent(q.content);
    if (options.length < 2) continue;
    out.push({
      id: `${exam.id}-${q.id}`,
      exam: exam.title,
      topic: q.type,
      stem,
      options,
      answer: q.answer?.trim?.() ?? q.answer,
    });
  }
}

fs.mkdirSync(new URL("../src/data/quizzes/", import.meta.url), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
console.log(`wrote ${out.length} questions -> ${OUT.pathname}`);
