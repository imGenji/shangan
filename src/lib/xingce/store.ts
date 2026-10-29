import { todayKey } from "../activity";

const KEY = "xingce-v1";

export type Attempt = {
  picked: string[];
  correct: boolean;
  at: string;
  ms: number;
  module: string;
  type: string;
  paperId: string;
};

export type MockRec = {
  paperId: string;
  title: string;
  at: string;
  score: number;
  total: number;
  elapsed: number;
  byModule: { module: string; right: number; total: number }[];
};

type DB = {
  attempts: Record<string, Attempt>;
  fav: Record<string, { module: string; type: string; paperId: string }>;
  mocks: MockRec[];
  /** 行测自己的每日作答次数，不和法考共用 */
  daily: Record<string, number>;
};

/** 旧数据没有 daily，用每题最后作答日期粗略补出来 */
function dailyFromAttempts(attempts: Record<string, Attempt>) {
  const daily: Record<string, number> = {};
  for (const a of Object.values(attempts)) if (a.at) daily[a.at] = (daily[a.at] ?? 0) + 1;
  return daily;
}

function normalize(raw: Partial<DB> | null | undefined): DB {
  const attempts = raw?.attempts && typeof raw.attempts === "object" ? raw.attempts : {};
  return {
    attempts,
    fav: raw?.fav && typeof raw.fav === "object" ? raw.fav : {},
    mocks: Array.isArray(raw?.mocks) ? raw.mocks : [],
    daily: raw?.daily && typeof raw.daily === "object" ? raw.daily : dailyFromAttempts(attempts),
  };
}

export function readDb(): DB {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return normalize(null);
  }
}

function writeDb(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function recordAttempt(qid: string, attempt: Attempt) {
  const db = readDb();
  db.attempts[qid] = attempt;
  db.daily[attempt.at] = (db.daily[attempt.at] ?? 0) + 1;
  writeDb(db);
}

export function toggleFav(qid: string, meta: { module: string; type: string; paperId: string }) {
  const db = readDb();
  if (db.fav[qid]) delete db.fav[qid];
  else db.fav[qid] = meta;
  writeDb(db);
  return !!db.fav[qid];
}

export function isFav(qid: string): boolean {
  return !!readDb().fav[qid];
}

export function saveMock(rec: MockRec) {
  const db = readDb();
  db.mocks.unshift(rec);
  db.mocks = db.mocks.slice(0, 40);
  writeDb(db);
}

export function wrongEntries() {
  return Object.entries(readDb().attempts).filter(([, a]) => !a.correct);
}

export function moduleStats(module: string) {
  const list = Object.values(readDb().attempts).filter((a) => a.module === module);
  const right = list.filter((a) => a.correct).length;
  return { done: list.length, right };
}

export function quizStreak(): number {
  const { daily } = readDb();
  const cursor = new Date();
  if (!daily[todayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (daily[todayKey(cursor)] && n < 2000) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export type HeatCell = { date: string; level: 0 | 1 | 2 | 3 | 4; label: string };

/** 行测热力图：weeks 列 × 7 行（周一起），按当天作答次数分级 */
export function heatCells(weeks = 26): HeatCell[] {
  const { daily } = readDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  const cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = todayKey(cursor);
    const n = daily[date] ?? 0;
    const level = n === 0 ? 0 : n <= 10 ? 1 : n <= 30 ? 2 : n <= 60 ? 3 : 4;
    cells.push({ date, level, label: n ? `${date} · 做题 ${n} 道` : `${date} · 无记录` });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

/** 行测自己的汇总：按题去重，today 只算今天最后一次作答落在今天的题 */
export function overview() {
  const db = readDb();
  const today = todayKey();
  const list = Object.values(db.attempts);
  const todays = list.filter((a) => a.at === today);
  const right = list.filter((a) => a.correct).length;
  return {
    done: list.length,
    right,
    wrong: list.length - right,
    today: todays.length,
    todayRight: todays.filter((a) => a.correct).length,
    fav: Object.keys(db.fav).length,
    mocks: db.mocks.length,
  };
}

export function exportJson(): string {
  return JSON.stringify(readDb(), null, 2);
}

export function importJson(text: string) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== "object" || typeof raw.attempts !== "object") {
    throw new Error("格式不对");
  }
  writeDb(normalize(raw));
}
