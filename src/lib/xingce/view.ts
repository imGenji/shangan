import { todayKey } from "../activity";
import { withBase } from "../base";
import { sanitizeHtml } from "./html";
import {
  loadIndex,
  loadSlice,
  materialOf,
  sameAnswer,
  type TypeRef,
  type XingceIndex,
  type XQuestion,
} from "./load";
import {
  exportJson,
  heatCells,
  importJson,
  isFav,
  moduleStats,
  overview,
  quizStreak,
  readDb,
  recordAttempt,
  saveMock,
  toggleFav,
  wrongEntries,
} from "./store";

export const DAILY_GOAL = 30;

type Mode = "practice" | "exam";

type Item = {
  q: XQuestion;
  module: string;
  paperId: string;
  title: string;
  materialHtml: string;
  picked: string[];
  ms: number;
  saved?: boolean;
};

/* ---------- DOM 小工具 ---------- */

type Kid = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & {
  class?: string;
  text?: string;
  on?: Record<string, (e: Event) => void>;
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Kid[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "text") el.textContent = String(v);
    else if (k === "on") {
      for (const [ev, fn] of Object.entries(v as Record<string, EventListener>)) el.addEventListener(ev, fn);
    } else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

/** 图标是写死的常量 SVG，不含外部输入 */
const ICONS = {
  star: '<path d="M12 3.6l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.62l-5.1 2.68.97-5.68L3.75 9.6l5.7-.83z"/>',
  flag: '<path d="M5.5 20.5V4.5"/><path d="M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  keyboard: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M7 10.5h.01M11 10.5h.01M15 10.5h.01M8 14h8"/>',
} as const;

function icon(name: keyof typeof ICONS) {
  const span = h("span", { class: "ico", "aria-hidden": "true" });
  span.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;
  return span;
}

function rich(className: string, raw: string) {
  const div = h("div", { class: className });
  div.innerHTML = sanitizeHtml(raw);
  // 只给题目图（图表等）加放大，行内公式小图不处理
  for (const img of div.querySelectorAll("img")) {
    if (!img.getAttribute("src")?.includes("题目图")) continue;
    img.classList.add("zoomable");
    img.addEventListener("click", () => zoom(img));
  }
  return div;
}

let zoomBox: HTMLDialogElement | null = null;

/** 原图分辨率低，放大到原尺寸 2 倍（不超视口）便于看清图表数字 */
function zoom(src: HTMLImageElement) {
  zoomBox ??= document.body.appendChild(h("dialog", { class: "zoom", on: { click: () => zoomBox?.close() } }));
  const img = h("img", { src: src.src, alt: "" });
  img.style.width = `${Math.min(src.naturalWidth * 2, innerWidth * 0.94)}px`;
  zoomBox.replaceChildren(img);
  zoomBox.showModal();
}

function ring(pct: number, label: string, sub: string, className = "ring") {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct || 0));
  const box = h("div", { class: className });
  box.innerHTML = `<svg viewBox="0 0 120 120"><circle class="ring-track" cx="60" cy="60" r="${r}"/><circle class="ring-val" cx="60" cy="60" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}"/></svg>`;
  box.append(h("div", { class: "ring-label" }, h("strong", { text: label }), h("span", { text: sub })));
  return box;
}

function bar(label: string, right: number, total: number, note = "") {
  const pct = total ? Math.round((right / total) * 100) : 0;
  return h(
    "div",
    { class: "bar-row", "data-mod": label },
    h("span", { class: "bar-label", text: label }),
    h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
    h("span", { class: "bar-val", text: total ? `${pct}%` : "—" }),
    note && h("span", { class: "bar-note", text: note }),
  );
}

function stat(label: string, value: string | number, hint = "") {
  return h(
    "div",
    { class: "stat" },
    h("span", { class: "stat-label", text: label }),
    h("strong", { class: "stat-val", text: typeof value === "number" ? value.toLocaleString("zh-CN") : value }),
    hint && h("span", { class: "stat-hint", text: hint }),
  );
}

function pageHead(eyebrow: string, title: string, sub: string) {
  return h(
    "header",
    { class: "page-head" },
    h("p", { class: "eyebrow", text: eyebrow }),
    h("h1", { class: "page-title", text: title }),
    h("p", { class: "page-sub", text: sub }),
  );
}

function shuffle<T>(list: T[]): T[] {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

function plainText(raw: string, max = 90) {
  const tmp = document.createElement("div");
  tmp.innerHTML = sanitizeHtml(raw);
  const text = (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text || "（图形题）";
}

/* ---------- 数据装配 ---------- */

type PaperGroup = { key: string; paperId: string; module: string; refs: TypeRef[] };

/** 按「试卷 + 模块」合并，同一份 JSON 只下载一次；顺序跟抽中的题一致 */
function groupRefs(refs: TypeRef[]): PaperGroup[] {
  const map = new Map<string, PaperGroup>();
  for (const ref of refs) {
    const key = `${ref.paperId}:${ref.module}`;
    const group = map.get(key) ?? { key, paperId: ref.paperId, module: ref.module, refs: [] };
    group.refs.push(ref);
    map.set(key, group);
  }
  return [...map.values()];
}

function withTimeout<T>(pending: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

type DrawStep = { key: string; status: "loading" | "done"; ready: number };

async function hydrate(refs: TypeRef[], onStep?: (step: DrawStep) => void): Promise<Item[]> {
  const groups = groupRefs(refs);
  const found = new Map<string, Item>();
  let cursor = 0;
  let ready = 0;
  // 同时最多读 3 套，加载列表上能看出当前在读哪套
  const worker = async () => {
    while (cursor < groups.length) {
      const group = groups[cursor++];
      onStep?.({ key: group.key, status: "loading", ready });
      const slice = await withTimeout(loadSlice(group.paperId, group.module), 20000, "题目下载超时，请换个网络再试");
      const byId = new Map(slice.questions.map((q) => [q.qid, q]));
      for (const ref of group.refs) {
        const q = byId.get(ref.qid);
        if (!q) continue;
        found.set(ref.qid, {
          q,
          module: ref.module,
          paperId: ref.paperId,
          title: slice.title,
          materialHtml: materialOf(slice, q),
          picked: [],
          ms: 0,
        });
        ready++;
      }
      onStep?.({ key: group.key, status: "done", ready });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, groups.length) }, worker));
  return refs.flatMap((ref) => found.get(ref.qid) ?? []);
}

type DrawRow = { key: string; title: string; module: string; n: number };

/** 组卷加载层：题数进度 + 每套试卷的读取状态 */
function mountDraw(root: HTMLElement, rows: DrawRow[], total: number) {
  const num = h("strong", { class: "draw-num", text: "0" });
  const paper = h("p", { class: "draw-paper", text: "正在连接题库" });
  const bar = h("i");
  const list = h("ol", { class: "draw-list" });
  const byKey = new Map<string, { li: HTMLElement; state: HTMLElement }>();
  for (const row of rows) {
    const state = h("b", { text: "等待" });
    const li = h(
      "li",
      {},
      h("span", { class: "draw-dot" }),
      h("span", { class: "draw-copy" }, h("strong", { text: row.title }), h("span", { class: "draw-meta", text: `${row.module} · ${row.n} 题` })),
      state,
    );
    byKey.set(row.key, { li, state });
    list.append(li);
  }
  const veil = h(
    "div",
    { class: "draw-veil", role: "status", "aria-live": "polite" },
    h(
      "section",
      { class: "draw-card" },
      h("p", { class: "eyebrow", text: "正在组卷" }),
      h("div", { class: "draw-count" }, num, h("span", { text: `/ ${total} 题` })),
      paper,
      h("div", { class: "prog draw-prog" }, bar),
      list,
    ),
  );
  root.append(veil);
  const titleOf = new Map(rows.map((row) => [row.key, row.title]));
  return {
    close() {
      veil.remove();
    },
    mark(key: string, status: "loading" | "done", ready: number) {
      const row = byKey.get(key);
      if (!row) return;
      row.li.classList.toggle("is-on", status === "loading");
      row.li.classList.toggle("is-done", status === "done");
      row.state.textContent = status === "loading" ? "读取中" : "已就绪";
      if (status === "loading") paper.textContent = titleOf.get(key) ?? "";
      num.textContent = String(ready);
      bar.style.width = `${total ? (ready / total) * 100 : 0}%`;
      const top = row.li.offsetTop;
      if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - row.li.offsetHeight) {
        list.scrollTop = Math.max(0, top - 8);
      }
    },
  };
}

function saveOne(item: Item) {
  if (item.saved) return;
  item.saved = true;
  recordAttempt(item.q.qid, {
    picked: item.picked.slice(),
    correct: sameAnswer(item.picked, item.q.answer),
    at: todayKey(),
    ms: item.ms,
    module: item.module,
    type: item.q.type,
    paperId: item.paperId,
  });
}

/* ---------- 专项练习：组卷 ---------- */

export function bootPractice(root: HTMLElement) {
  const pool = new URLSearchParams(location.search).get("pool") ?? "all";
  root.replaceChildren(h("p", { class: "loading", text: "正在加载题库…" }));
  loadIndex()
    .then((index) => renderSetup(root, index, pool))
    .catch(() => {
      root.replaceChildren(h("p", { class: "empty", text: "题库还没导入。在项目根目录运行 npm run import:xingce" }));
    });
}

const POOLS = [
  { id: "all", label: "全部题目", hint: "从所选范围随机抽" },
  { id: "undone", label: "没做过的", hint: "跳过已经作答的题" },
  { id: "wrong", label: "错题", hint: "最近一次答错的题" },
  { id: "fav", label: "收藏", hint: "你标星的题" },
] as const;

function renderSetup(root: HTMLElement, index: XingceIndex, initialPool: string) {
  const db = readDb();
  const mods = new Set(index.modules);
  const types = new Set<string>();
  let count = 10;
  let pool: string = POOLS.some((p) => p.id === initialPool) ? initialPool : "all";

  function candidates() {
    let refs = Object.entries(index.typeIndex)
      .flatMap(([name, list]) => (types.size === 0 || types.has(name) ? list : []))
      .filter((r) => mods.has(r.module));
    if (pool === "undone") refs = refs.filter((r) => !db.attempts[r.qid]);
    if (pool === "wrong") refs = refs.filter((r) => db.attempts[r.qid] && !db.attempts[r.qid].correct);
    if (pool === "fav") refs = refs.filter((r) => db.fav[r.qid]);
    return refs;
  }

  /* 模块 */
  const modGrid = h("div", { class: "pick-grid" });
  for (const mod of index.modules) {
    const total = index.stats.modules[mod] ?? 0;
    const s = moduleStats(mod);
    const btn = h(
      "button",
      { type: "button", class: "pick is-on", "data-mod": mod, "aria-pressed": "true" },
      h("span", { class: "pick-check" }, icon("check")),
      h("strong", { class: "pick-name", text: mod }),
      h("span", { class: "pick-meta", text: `${total.toLocaleString("zh-CN")} 题 · 已做 ${s.done}` }),
      h("span", { class: "mini-bar" }, h("i", { style: `width:${total ? Math.min(100, (s.done / total) * 100) : 0}%` })),
    );
    btn.addEventListener("click", () => {
      if (mods.has(mod) && mods.size === 1) return;
      if (mods.has(mod)) mods.delete(mod);
      else mods.add(mod);
      btn.classList.toggle("is-on", mods.has(mod));
      btn.setAttribute("aria-pressed", String(mods.has(mod)));
      fillTypes();
      refresh();
    });
    modGrid.append(btn);
  }

  /* 题型 */
  const typeBox = h("div", { class: "chips" });
  function fillTypes() {
    const rows = Object.entries(index.typeIndex)
      .map(([name, list]) => [name, list.filter((r) => mods.has(r.module)).length] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    for (const name of [...types]) if (!rows.some(([n]) => n === name)) types.delete(name);
    typeBox.replaceChildren(
      ...rows.map(([name, n]) => {
        const chip = h(
          "button",
          { type: "button", class: types.has(name) ? "chip is-on" : "chip" },
          name,
          h("span", { class: "chip-n", text: n.toLocaleString("zh-CN") }),
        );
        chip.addEventListener("click", () => {
          if (types.has(name)) types.delete(name);
          else types.add(name);
          chip.classList.toggle("is-on", types.has(name));
          refresh();
        });
        return chip;
      }),
    );
  }
  fillTypes();

  /* 题量 */
  const countSeg = h("div", { class: "seg" });
  for (const n of [10, 20, 30, 50]) {
    const b = h("button", { type: "button", class: n === count ? "seg-item is-on" : "seg-item", text: `${n} 题` });
    b.addEventListener("click", () => {
      count = n;
      countSeg.querySelectorAll(".seg-item").forEach((el) => el.classList.remove("is-on"));
      b.classList.add("is-on");
      refresh();
    });
    countSeg.append(b);
  }

  /* 范围 */
  const poolGrid = h("div", { class: "pool-grid" });
  for (const p of POOLS) {
    const b = h(
      "button",
      { type: "button", class: p.id === pool ? "pool is-on" : "pool" },
      h("strong", { text: p.label }),
      h("span", { text: p.hint }),
    );
    b.addEventListener("click", () => {
      pool = p.id;
      poolGrid.querySelectorAll(".pool").forEach((el) => el.classList.remove("is-on"));
      b.classList.add("is-on");
      refresh();
    });
    poolGrid.append(b);
  }

  /* 右侧摘要 */
  const sumMods = h("dd");
  const sumTypes = h("dd");
  const sumPool = h("dd");
  const sumAvail = h("strong", { class: "sum-big" });
  const err = h("p", { class: "form-err", role: "alert" });
  const start = h("button", { type: "button", class: "btn btn-primary btn-lg btn-block" }, "开始练习", icon("right"));

  function refresh() {
    const n = candidates().length;
    sumMods.textContent = mods.size === index.modules.length ? "全部模块" : [...mods].join("、");
    sumTypes.textContent = types.size ? `${types.size} 个题型` : "全部题型";
    sumPool.textContent = POOLS.find((p) => p.id === pool)?.label ?? "";
    sumAvail.textContent = `${Math.min(count, n)}`;
    start.toggleAttribute("disabled", n === 0);
    err.textContent = n === 0 ? "这个范围里没有题，换个条件试试。" : "";
  }

  start.addEventListener("click", async () => {
    const refs = candidates();
    if (!refs.length) return;
    const picked = shuffle(refs).slice(0, count);
    const titleOf = new Map(index.papers.map((p) => [p.id, p.title]));
    const draw = mountDraw(
      root,
      groupRefs(picked).map((g) => ({
        key: g.key,
        title: titleOf.get(g.paperId) || "试卷",
        module: g.module,
        n: g.refs.length,
      })),
      picked.length,
    );
    start.setAttribute("disabled", "");
    try {
      const items = await hydrate(picked, (step) => draw.mark(step.key, step.status, step.ready));
      draw.close();
      if (!items.length) throw new Error("题目文件缺失");
      runSession(root, items, "practice", 0, `专项练习 · ${items.length} 题`);
    } catch (e) {
      draw.close();
      err.textContent = e instanceof Error ? e.message : "抽题失败";
      start.removeAttribute("disabled");
    }
  });

  const step = (n: number, title: string, desc: string, body: Node) =>
    h(
      "section",
      { class: "step" },
      h("div", { class: "step-head" }, h("span", { class: "step-n", text: n }), h("div", {}, h("h2", { text: title }), h("p", { text: desc }))),
      body,
    );

  root.replaceChildren(
    pageHead("专项练习", "挑一块弱项，集中练。", "做一题判一题，解析当场展开。键盘按 A–D 作答，回车进入下一题。"),
    h(
      "div",
      { class: "setup" },
      h(
        "div",
        { class: "setup-main" },
        step(1, "模块", "至少保留一个。条形是你在该模块的完成度。", modGrid),
        step(2, "题型", "不选就是该模块下全部题型。", typeBox),
        step(3, "范围", "错题和收藏会随你做题自动更新。", poolGrid),
        step(4, "题量", "一组 10 题大约 10–15 分钟。", countSeg),
      ),
      h(
        "aside",
        { class: "setup-side" },
        h(
          "div",
          { class: "sum-card" },
          h("p", { class: "eyebrow", text: "本组" }),
          h("div", { class: "sum-head" }, sumAvail, h("span", { text: "道题" })),
          h("dl", { class: "sum-list" }, h("dt", { text: "模块" }), sumMods, h("dt", { text: "题型" }), sumTypes, h("dt", { text: "范围" }), sumPool),
          start,
          err,
        ),
      ),
    ),
  );
  refresh();
}

/* ---------- 做题会话 ---------- */

function paintOptions(item: Item, onChange: () => void) {
  const list = h("div", { class: "opts", role: "group", "aria-label": "选项" });
  for (const opt of item.q.options) {
    const btn = h(
      "button",
      { type: "button", class: "opt", "data-key": opt.key },
      h("span", { class: "opt-key", text: opt.key }),
      rich("opt-text", opt.text),
      h("span", { class: "opt-mark" }),
    );
    btn.addEventListener("click", () => {
      if (list.dataset.locked === "1") return;
      if (item.q.kind === "single") item.picked = [opt.key];
      else {
        item.picked = item.picked.includes(opt.key)
          ? item.picked.filter((k) => k !== opt.key)
          : [...item.picked, opt.key];
      }
      onChange();
    });
    list.append(btn);
  }
  return list;
}

function markOptions(list: HTMLElement, item: Item, reveal: boolean) {
  list.dataset.locked = reveal ? "1" : "0";
  for (const btn of list.querySelectorAll<HTMLButtonElement>(".opt")) {
    const key = btn.dataset.key ?? "";
    const on = item.picked.includes(key);
    const right = item.q.answer.includes(key);
    btn.classList.toggle("is-on", on);
    btn.classList.toggle("is-right", reveal && right);
    btn.classList.toggle("is-wrong", reveal && on && !right);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.disabled = reveal;
  }
}

function feedback(item: Item) {
  const ok = sameAnswer(item.picked, item.q.answer);
  return h(
    "section",
    { class: ok ? "feedback is-pass" : "feedback is-fail", "aria-live": "polite" },
    h(
      "div",
      { class: "fb-head" },
      h("span", { class: "fb-icon" }, icon(ok ? "check" : "x")),
      h("div", {}, h("strong", { text: ok ? "回答正确" : "回答错误" }), h("span", { text: `你的答案 ${item.picked.join("") || "—"}　正确答案 ${item.q.answer.join("")}` })),
    ),
    h("p", { class: "fb-label", text: "官方解析" }),
    item.q.analysisHtml ? rich("fb-body", item.q.analysisHtml) : h("p", { class: "fb-body", text: "这道题没有官方解析，对照正确选项复盘。" }),
  );
}

function runSession(root: HTMLElement, items: Item[], mode: Mode, limitSec: number, title: string) {
  let cursor = 0;
  let entered = performance.now();
  let clock = limitSec;
  let paused = false;
  let submitted = false;
  const marked = new Set<string>();
  const revealed = new Set<string>();
  const ac = new AbortController();

  const timeEl = h("strong", { class: "clock-val", text: fmt(clock) });
  const progBar = h("i");
  const progText = h("span", { class: "prog-text" });
  const sheet = h("div", { class: "sheet" });
  const stage = h("div", { class: "stage" });
  const actions = h("div", { class: "s-actions" });

  const exit = h("a", { class: "s-exit", href: withBase(mode === "exam" ? "xingce/papers/" : "xingce/practice/") }, icon("left"), "退出");
  exit.addEventListener("click", (e) => {
    const touched = items.some((it) => it.picked.length);
    if (touched && !confirm(mode === "exam" ? "还没交卷，退出后这次作答不保存。" : "退出后，已判分的题仍会记录。确定退出？")) e.preventDefault();
  });

  const pauseBtn = h("button", { type: "button", class: "btn btn-ghost btn-block" }, icon("pause"), "暂停");
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    shell.classList.toggle("is-paused", paused);
    pauseBtn.replaceChildren(icon(paused ? "play" : "pause"), paused ? "继续" : "暂停");
  });
  const handIn = h("button", { type: "button", class: "btn btn-primary btn-block" }, "交卷");
  handIn.addEventListener("click", () => {
    const blank = items.filter((it) => it.picked.length === 0).length;
    if (blank && !confirm(`还有 ${blank} 题没做，确定交卷？`)) return;
    finish();
  });

  const legend =
    mode === "exam"
      ? h("div", { class: "legend" }, h("span", { class: "lg lg-done", text: "已答" }), h("span", { class: "lg lg-mark", text: "标记" }), h("span", { class: "lg lg-cur", text: "当前" }))
      : h("div", { class: "legend" }, h("span", { class: "lg lg-ok", text: "答对" }), h("span", { class: "lg lg-bad", text: "答错" }), h("span", { class: "lg lg-cur", text: "当前" }));

  const shell = h(
    "div",
    { class: `session is-${mode}` },
    h(
      "div",
      { class: "s-top" },
      exit,
      h("div", { class: "s-title" }, h("span", { class: "eyebrow", text: mode === "exam" ? "套卷模考" : "专项练习" }), h("strong", { text: title })),
      h("div", { class: "s-clock", title: mode === "exam" ? "剩余时间" : "已用时间" }, icon("clock"), timeEl),
    ),
    h("div", { class: "prog" }, progBar),
    h(
      "div",
      { class: "s-body" },
      h("div", { class: "s-main" }, stage, actions, h("div", { class: "paused-veil" }, h("strong", { text: "已暂停" }), h("span", { text: "题目已隐藏，计时停止" }))),
      h(
        "aside",
        { class: "s-side" },
        h("section", { class: "side-card" }, h("div", { class: "side-row" }, h("h3", { text: "答题卡" }), progText), sheet, legend),
        mode === "exam" && h("section", { class: "side-card side-stack" }, pauseBtn, handIn),
        h("p", { class: "kbd-hint" }, icon("keyboard"), "A–D 选择 · ← → 切题 · 回车确认"),
      ),
    ),
    h("div", { class: "sheet-mask", on: { click: () => toggleSheet(false) } }),
  );
  // 手机端答题卡是底部抽屉，由操作栏按钮打开
  const toggleSheet = (on: boolean) => shell.classList.toggle("show-sheet", on);
  root.replaceChildren(shell);

  // 手机端左右滑动切题；表格横滑时不触发
  let tx = 0;
  let ty = 0;
  stage.addEventListener("touchstart", (e) => ((tx = e.touches[0].clientX), (ty = e.touches[0].clientY)), { passive: true, signal: ac.signal });
  stage.addEventListener(
    "touchend",
    (e) => {
      if (paused || submitted || (e.target as Element).closest("table")) return;
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) go(cursor + (dx < 0 ? 1 : -1));
    },
    { passive: true, signal: ac.signal },
  );
  window.scrollTo({ top: 0 });

  function touchTime() {
    const now = performance.now();
    items[cursor].ms += now - entered;
    entered = now;
  }

  function go(next: number) {
    if (next < 0 || next >= items.length) return;
    touchTime();
    cursor = next;
    draw();
    stage.scrollIntoView({ block: "nearest" });
  }

  function reveal() {
    const item = items[cursor];
    if (!item.picked.length) return;
    touchTime();
    revealed.add(item.q.qid);
    saveOne(item);
    draw();
  }

  function draw() {
    const item = items[cursor];
    const showing = mode === "practice" && revealed.has(item.q.qid);

    const opts = paintOptions(item, () => {
      markOptions(opts, item, showing);
      if (mode === "practice" && item.q.kind === "single") reveal();
      else {
        paintSheet();
        paintActions();
      }
    });
    markOptions(opts, item, showing);

    const fav = h("button", { type: "button", class: "tool", "aria-pressed": String(isFav(item.q.qid)) }, icon("star"), h("span", { class: "tool-text" }));
    const syncFav = () => {
      const on = isFav(item.q.qid);
      fav.classList.toggle("is-active", on);
      fav.setAttribute("aria-pressed", String(on));
      fav.querySelector(".tool-text")!.textContent = on ? "已收藏" : "收藏";
    };
    fav.addEventListener("click", () => {
      toggleFav(item.q.qid, { module: item.module, type: item.q.type, paperId: item.paperId });
      syncFav();
    });
    syncFav();

    let markBtn: HTMLButtonElement | null = null;
    if (mode === "exam") {
      const on = marked.has(item.q.qid);
      markBtn = h("button", { type: "button", class: on ? "tool is-flag" : "tool", "aria-pressed": String(on) }, icon("flag"), h("span", { class: "tool-text", text: on ? "已标记" : "标记" }));
      markBtn.addEventListener("click", () => {
        if (marked.has(item.q.qid)) marked.delete(item.q.qid);
        else marked.add(item.q.qid);
        draw();
      });
    }

    const card = h(
      "article",
      { class: item.materialHtml ? "q-card has-material" : "q-card" },
      h(
        "div",
        { class: "q-toolbar" },
        h(
          "div",
          { class: "q-meta" },
          h("span", { class: "q-no" }, h("b", { text: cursor + 1 }), ` / ${items.length}`),
          h("span", { class: "tag", "data-mod": item.module, text: item.module }),
          h("span", { class: "tag tag-soft", text: item.q.type }),
          item.q.kind === "multi" && h("span", { class: "tag tag-warn", text: "多选" }),
        ),
        h("div", { class: "q-tools" }, markBtn, fav),
      ),
      item.materialHtml && h("section", { class: "material" }, h("p", { class: "material-head", text: "资料" }), rich("material-body", item.materialHtml)),
      h("div", { class: "q-main" }, rich("stem", item.q.stemHtml), opts, showing && feedback(item)),
    );
    stage.replaceChildren(card);
    paintActions();
    paintSheet();
  }

  function paintActions() {
    const item = items[cursor];
    const showing = revealed.has(item.q.qid);
    const prev = h("button", { type: "button", class: "btn btn-ghost", "data-prev": "" }, icon("left"), "上一题");
    prev.toggleAttribute("disabled", cursor === 0);
    prev.addEventListener("click", () => go(cursor - 1));

    let main: HTMLElement;
    if (mode === "exam") {
      const last = cursor === items.length - 1;
      main = last
        ? h("button", { type: "button", class: "btn btn-primary" }, "交卷")
        : h("button", { type: "button", class: "btn btn-primary", "data-next": "" }, "下一题", icon("right"));
      main.addEventListener("click", () => (last ? handIn.click() : go(cursor + 1)));
    } else if (showing) {
      const last = cursor === items.length - 1;
      main = h("button", { type: "button", class: "btn btn-primary", "data-next": "" }, last ? "查看结果" : "下一题", icon("right"));
      main.addEventListener("click", () => (last ? finish() : go(cursor + 1)));
    } else if (item.q.kind === "multi") {
      main = h("button", { type: "button", class: "btn btn-primary", "data-next": "" }, "提交答案");
      main.toggleAttribute("disabled", item.picked.length === 0);
      main.addEventListener("click", reveal);
    } else {
      main = h("span", { class: "act-hint", text: "选一个选项就会判分" });
    }
    const sheetBtn = h("button", { type: "button", class: "btn btn-ghost sheet-toggle", on: { click: () => toggleSheet(true) } }, "答题卡");
    actions.replaceChildren(prev, sheetBtn, h("span", { class: "spacer" }), main);
  }

  function paintSheet() {
    const db = mode === "practice" ? readDb() : null;
    sheet.replaceChildren(
      ...items.map((item, i) => {
        const cls = ["sheet-n"];
        if (i === cursor) cls.push("is-current");
        if (mode === "exam") {
          if (item.picked.length) cls.push("is-done");
          if (marked.has(item.q.qid)) cls.push("is-mark");
        } else if (revealed.has(item.q.qid) && db?.attempts[item.q.qid]) {
          cls.push(db.attempts[item.q.qid].correct ? "is-ok" : "is-bad");
        }
        const b = h("button", { type: "button", class: cls.join(" "), text: i + 1, "aria-label": `第 ${i + 1} 题` });
        b.addEventListener("click", () => {
          go(i);
          toggleSheet(false);
        });
        return b;
      }),
    );
    const done = mode === "exam" ? items.filter((it) => it.picked.length).length : revealed.size;
    progText.textContent = `${done} / ${items.length}`;
    progBar.style.width = `${(done / items.length) * 100}%`;
  }

  function finish() {
    if (submitted) return;
    submitted = true;
    ac.abort();
    window.clearInterval(timer);
    touchTime();
    for (const item of items) saveOne(item);
    const elapsed = limitSec ? limitSec - clock : clock;
    if (mode === "exam") {
      const byModule = new Map<string, { right: number; total: number }>();
      let score = 0;
      for (const item of items) {
        const cell = byModule.get(item.module) ?? { right: 0, total: 0 };
        cell.total++;
        if (sameAnswer(item.picked, item.q.answer)) {
          cell.right++;
          score++;
        }
        byModule.set(item.module, cell);
      }
      saveMock({
        paperId: items[0]?.paperId ?? "",
        title,
        at: new Date().toISOString(),
        score,
        total: items.length,
        elapsed,
        byModule: [...byModule.entries()].map(([module, v]) => ({ module, ...v })),
      });
    }
    renderResult(root, items, mode, elapsed, title);
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (submitted || paused || zoomBox?.open || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const key = e.key.toUpperCase();
      if (/^[A-H]$/.test(key)) {
        stage.querySelector<HTMLButtonElement>(`.opt[data-key="${key}"]:not(:disabled)`)?.click();
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        go(cursor - 1);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        actions.querySelector<HTMLButtonElement>("[data-next]:not(:disabled)")?.click();
        if (e.key === "Enter") e.preventDefault();
      }
    },
    { signal: ac.signal },
  );

  const timer = window.setInterval(() => {
    if (paused || submitted) return;
    clock += limitSec ? -1 : 1;
    timeEl.textContent = fmt(clock);
    if (limitSec && clock <= 300) shell.classList.add("is-late");
    if (limitSec && clock <= 0) finish();
  }, 1000);

  draw();
}

/* ---------- 结果页 ---------- */

function renderResult(root: HTMLElement, items: Item[], mode: Mode, elapsed: number, title: string) {
  const total = items.length;
  const right = items.filter((it) => sameAnswer(it.picked, it.q.answer)).length;
  const answered = items.filter((it) => it.picked.length).length;
  const pct = total ? right / total : 0;
  const headline = pct >= 0.8 ? "稳了，保持这个手感。" : pct >= 0.6 ? "不错，错题再磨一遍。" : "别急，错题就是提分点。";

  const byModule = new Map<string, { right: number; total: number }>();
  for (const it of items) {
    const cell = byModule.get(it.module) ?? { right: 0, total: 0 };
    cell.total++;
    if (sameAnswer(it.picked, it.q.answer)) cell.right++;
    byModule.set(it.module, cell);
  }

  const review = h("div", { class: "review" });
  items.forEach((it, i) => {
    const ok = sameAnswer(it.picked, it.q.answer);
    const blank = !it.picked.length;
    const row = h(
      "details",
      { class: `review-row ${blank ? "is-blank" : ok ? "is-ok" : "is-bad"}` },
      h(
        "summary",
        {},
        h("span", { class: "review-dot" }, icon(ok ? "check" : "x")),
        h("span", { class: "review-no", text: `第 ${i + 1} 题` }),
        h("span", { class: "review-stem", text: plainText(it.q.stemHtml, 60) }),
        h("span", { class: "review-ans", text: `${it.picked.join("") || "未答"} / ${it.q.answer.join("")}` }),
        h("span", { class: "review-time", text: `${Math.round(it.ms / 1000)}s` }),
      ),
      h(
        "div",
        { class: "review-body" },
        h("div", { class: "q-meta" }, h("span", { class: "tag", "data-mod": it.module, text: it.module }), h("span", { class: "tag tag-soft", text: it.q.type })),
        it.materialHtml && rich("material-body review-material", it.materialHtml),
        rich("stem", it.q.stemHtml),
        it.q.analysisHtml ? rich("fb-body", it.q.analysisHtml) : h("p", { class: "fb-body", text: "这道题没有官方解析。" }),
      ),
    );
    review.append(row);
  });

  root.replaceChildren(
    h(
      "section",
      { class: "result-hero" },
      ring(pct, `${Math.round(pct * 100)}%`, "正确率", "ring ring-lg"),
      h(
        "div",
        { class: "result-copy" },
        h("p", { class: "eyebrow", text: mode === "exam" ? "交卷完成" : "本组完成" }),
        h("h1", { class: "page-title", text: headline }),
        h("p", { class: "page-sub", text: title }),
        h(
          "div",
          { class: "hero-actions" },
          h("a", { class: "btn btn-primary", href: withBase(mode === "exam" ? "xingce/papers/" : "xingce/practice/") }, mode === "exam" ? "再来一套" : "再练一组", icon("right")),
          h("a", { class: "btn btn-ghost", href: withBase("xingce/practice/?pool=wrong") }, "练错题"),
        ),
      ),
    ),
    h(
      "section",
      { class: "stat-grid" },
      stat("答对", right, `共 ${total} 题`),
      stat("答错", answered - right),
      stat("未答", total - answered),
      stat("用时", fmt(elapsed)),
      stat("平均每题", `${total ? Math.round(elapsed / total) : 0}s`),
    ),
    h(
      "div",
      { class: "two-col" },
      h("section", { class: "panel" }, h("h2", { class: "panel-title", text: "分模块" }), ...[...byModule].map(([m, v]) => bar(m, v.right, v.total, `${v.right}/${v.total}`))),
      h("section", { class: "panel panel-wide" }, h("h2", { class: "panel-title", text: "逐题回顾" }), h("p", { class: "panel-sub", text: "点开看题干和解析。格式：你的答案 / 正确答案。" }), review),
    ),
  );
  window.scrollTo({ top: 0 });
}

/* ---------- 套卷模考 ---------- */

export function bootExam(root: HTMLElement) {
  const id = root.dataset.id ?? "";
  const title = root.dataset.title ?? "模考";
  const modules = (root.dataset.modules ?? "").split("|").filter(Boolean);
  const total = Number(root.dataset.count) || 0;
  const minutes = 120;

  const start = h("button", { type: "button", class: "btn btn-primary btn-lg" }, "开始作答", icon("right"));
  const err = h("p", { class: "form-err", role: "alert" });
  root.replaceChildren(
    h(
      "section",
      { class: "exam-intro" },
      h("p", { class: "eyebrow", text: [root.dataset.region, root.dataset.year].filter(Boolean).join(" · ") }),
      h("h1", { class: "page-title", text: title }),
      h("div", { class: "stat-grid" }, stat("题量", total), stat("时长", `${minutes} 分钟`), stat("模块", modules.length)),
      h("div", { class: "chips" }, ...modules.map((m) => h("span", { class: "tag", "data-mod": m, text: m }))),
      h(
        "ul",
        { class: "rules" },
        h("li", { text: "交卷前不显示对错，和真实考试一致。" }),
        h("li", { text: "可以暂停；暂停时题目会被遮住。" }),
        h("li", { text: "答题卡里可以标记没把握的题，交卷前回头看。" }),
      ),
      start,
      err,
    ),
  );

  start.addEventListener("click", async () => {
    start.setAttribute("disabled", "");
    start.firstChild!.textContent = "装载试卷…";
    try {
      const slices = await Promise.all(modules.map((m) => loadSlice(id, m)));
      const items: Item[] = slices.flatMap((slice) =>
        slice.questions.map((q) => ({
          q,
          module: slice.module,
          paperId: slice.paperId,
          title,
          materialHtml: materialOf(slice, q),
          picked: [],
          ms: 0,
        })),
      );
      if (!items.length) throw new Error("这套卷没有题目");
      runSession(root, items, "exam", minutes * 60, title);
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : "试卷加载失败";
      start.removeAttribute("disabled");
      start.firstChild!.textContent = "开始作答";
    }
  });
}

/* ---------- 首页 ---------- */

function countUp(el: HTMLElement, n: number) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || n === 0) {
    el.textContent = n.toLocaleString("zh-CN");
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / 1000);
    el.textContent = Math.round(n * (1 - (1 - p) ** 3)).toLocaleString("zh-CN");
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function heatInto(box: Element, weeks: number) {
  box.replaceChildren(
    ...heatCells(weeks).map((cell) => h("i", { "data-lv": cell.level, title: cell.label })),
  );
  // 窄屏放不下时横滑，默认停在最近几周
  box.scrollLeft = box.scrollWidth;
}

export function bootHome(root: HTMLElement) {
  const o = overview();
  const streak = quizStreak();
  const live: Record<string, number> = {
    today: o.today,
    done: o.done,
    acc: o.done ? Math.round((o.right / o.done) * 100) : 0,
    streak,
    wrong: o.wrong,
    fav: o.fav,
  };
  for (const el of root.querySelectorAll<HTMLElement>("[data-live]")) countUp(el, live[el.dataset.live ?? ""] ?? 0);

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      countUp(el, Number(el.dataset.n || 0));
      io.unobserve(el);
    }
  });
  root.querySelectorAll<HTMLElement>("[data-n]").forEach((el) => io.observe(el));

  const ringBox = root.querySelector("[data-ring]");
  if (ringBox) ringBox.replaceWith(ring(o.today / DAILY_GOAL, String(o.today), `今日目标 ${DAILY_GOAL}`, "ring ring-hero"));
  const goalNote = root.querySelector("[data-goal-note]");
  if (goalNote) {
    goalNote.textContent =
      o.today >= DAILY_GOAL ? "今天的目标完成了。" : o.today ? `再做 ${DAILY_GOAL - o.today} 题完成今日目标` : "今天还没开练，从 10 题开始。";
  }

  for (const card of root.querySelectorAll<HTMLElement>("[data-mod-card]")) {
    const mod = card.dataset.mod ?? "";
    const total = Number(card.dataset.total || 0);
    const s = moduleStats(mod);
    const done = card.querySelector("[data-done]");
    const acc = card.querySelector("[data-acc]");
    const fill = card.querySelector<HTMLElement>("[data-fill]");
    if (done) done.textContent = s.done.toLocaleString("zh-CN");
    if (acc) acc.textContent = s.done ? `${Math.round((s.right / s.done) * 100)}%` : "—";
    if (fill) fill.style.width = `${total ? Math.max(s.done ? 2 : 0, (s.done / total) * 100) : 0}%`;
  }

  const heat = root.querySelector("[data-heat]");
  if (heat) heatInto(heat, 26);

  const mocks = root.querySelector("[data-mocks]");
  if (mocks) {
    const list = readDb().mocks.slice(0, 4);
    mocks.replaceChildren(
      ...(list.length
        ? list.map((m) =>
            h(
              "div",
              { class: "mock-row" },
              h("div", {}, h("strong", { text: m.title }), h("span", { text: `${m.at.slice(0, 10)} · 用时 ${fmt(m.elapsed)}` })),
              h("span", { class: "score-pill", text: `${Math.round((m.score / Math.max(1, m.total)) * 100)}%` }),
            ),
          )
        : [h("p", { class: "empty", text: "还没有模考记录。挑一套卷，按真实考试走一遍。" })]),
    );
  }
}

/* ---------- 导航上的今日题量 ---------- */

export function bootNav() {
  const el = document.querySelector("[data-nav-today]");
  if (el) el.textContent = String(overview().today);
}

/* ---------- 我的 ---------- */

export async function bootMe(root: HTMLElement) {
  const db = readDb();
  const o = overview();
  const streak = quizStreak();
  const wrong = wrongEntries().sort((a, b) => b[1].at.localeCompare(a[1].at));

  const exportBtn = h("button", { type: "button", class: "btn btn-ghost" }, "导出进度");
  exportBtn.addEventListener("click", () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `xingce-progress-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const file = h("input", { type: "file", accept: "application/json", hidden: true });
  const importBtn = h("button", { type: "button", class: "btn btn-ghost" }, "导入进度");
  importBtn.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (!confirm("导入会覆盖当前浏览器里的行测进度，继续？")) return;
    try {
      importJson(await f.text());
      location.reload();
    } catch {
      alert("这个文件读不了");
    }
  });

  const modPanel = h("section", { class: "panel" }, h("h2", { class: "panel-title", text: "分模块掌握" }));
  const heat = h("div", { class: "heat heat-lg", "aria-label": "做题热力图" });
  heatInto(heat, 26);

  const quick = (pool: string, label: string, n: number | string, hint: string) =>
    h("a", { class: "quick", href: withBase(`xingce/practice/?pool=${pool}`) }, h("strong", { text: label }), h("span", { class: "quick-n", text: n }), h("span", { class: "quick-hint", text: hint }), icon("right"));

  const mockList = h(
    "div",
    { class: "mock-list" },
    ...(db.mocks.length
      ? db.mocks.map((m) => {
          const p = Math.round((m.score / Math.max(1, m.total)) * 100);
          return h(
            "div",
            { class: "mock-row" },
            h("div", {}, h("strong", { text: m.title }), h("span", { text: `${m.at.slice(0, 16).replace("T", " ")} · 用时 ${fmt(m.elapsed)}` })),
            h("div", { class: "mock-score" }, h("div", { class: "bar" }, h("i", { style: `width:${p}%` })), h("span", { class: "score-pill", text: `${m.score}/${m.total}` })),
          );
        })
      : [h("p", { class: "empty", text: "还没有交过卷。" })]),
  );

  const wrongBox = h("div", { class: "wrong-grid" });

  root.replaceChildren(
    pageHead("我的", "学习档案", "进度只存在这台浏览器。换设备或清缓存前，先导出一份。"),
    h(
      "section",
      { class: "stat-grid stat-grid-6" },
      stat("今日", o.today, `目标 ${DAILY_GOAL}`),
      stat("累计做题", o.done, "按题去重"),
      stat("正确率", o.done ? `${Math.round((o.right / o.done) * 100)}%` : "—"),
      stat("连续天数", streak),
      stat("错题", o.wrong),
      stat("收藏", o.fav),
    ),
    h(
      "section",
      { class: "quick-grid" },
      quick("wrong", "重做错题", o.wrong, "最近一次答错的题"),
      quick("fav", "刷收藏", o.fav, "你标星的题"),
      quick("undone", "只做新题", "∞", "跳过做过的"),
    ),
    h("div", { class: "two-col" }, modPanel, h("section", { class: "panel" }, h("h2", { class: "panel-title", text: "近半年活跃" }), heat, h("p", { class: "panel-sub", text: "颜色越深，当天做得越多。" }))),
    h("section", { class: "panel" }, h("h2", { class: "panel-title", text: "模考记录" }), mockList),
    h("section", { class: "panel" }, h("div", { class: "panel-row" }, h("h2", { class: "panel-title", text: "最近错题" }), h("span", { class: "panel-sub", text: `共 ${wrong.length} 道` })), wrongBox),
    h(
      "section",
      { class: "panel panel-row data-panel" },
      h("div", {}, h("h2", { class: "panel-title", text: "数据" }), h("p", { class: "panel-sub", text: "导出 JSON 备份；在另一台设备导入即可恢复。" })),
      h("div", { class: "btn-row" }, exportBtn, importBtn, file),
    ),
  );

  try {
    const index = await loadIndex();
    for (const m of index.modules) {
      const s = moduleStats(m);
      modPanel.append(bar(m, s.right, s.done, `做过 ${s.done} / ${(index.stats.modules[m] ?? 0).toLocaleString("zh-CN")}`));
    }
  } catch {
    modPanel.append(h("p", { class: "empty", text: "题库索引加载失败。" }));
  }

  const refs: TypeRef[] = wrong.slice(0, 12).map(([qid, a]) => ({ qid, paperId: a.paperId, module: a.module }));
  if (!refs.length) {
    wrongBox.append(h("p", { class: "empty", text: "没有错题，继续保持。" }));
    return;
  }
  wrongBox.append(h("p", { class: "loading", text: "加载题干…" }));
  try {
    const items = await hydrate(refs);
    wrongBox.replaceChildren(
      ...items.map((it) => {
        const a = db.attempts[it.q.qid];
        return h(
          "article",
          { class: "wrong-card" },
          h("div", { class: "q-meta" }, h("span", { class: "tag", "data-mod": it.module, text: it.module }), h("span", { class: "tag tag-soft", text: it.q.type })),
          h("p", { class: "wrong-stem", text: plainText(it.q.stemHtml) }),
          h("p", { class: "wrong-ans" }, "你选 ", h("b", { class: "bad", text: a?.picked.join("") || "—" }), "　正确 ", h("b", { class: "ok", text: it.q.answer.join("") })),
        );
      }),
    );
  } catch {
    wrongBox.replaceChildren(h("p", { class: "empty", text: "错题题干加载失败，仍可以用上面的「重做错题」。" }));
  }
}
