/** 本地学习活跃度：日历热力图 + 深浅分级 */

export const PLAN_START = new Date("2026-09-08");
export const ACTIVITY_KEY = "activity-daily";
export const CHECKINS_KEY = "checkins";

export type CheckinEntry = { day: number; at: string };
export type DailyEntry = { checkins: number[]; quizzes: number };

export function todayKey(d = new Date()): string {
  return d.toLocaleDateString("sv-SE");
}

/** 计划 Day N → 日历日期（旧数据迁移用） */
export function dayToDate(day: number): string {
  const d = new Date(PLAN_START);
  if (day <= 0) return todayKey(d);
  d.setDate(d.getDate() + day - 1);
  return todayKey(d);
}

export function readCheckins(): CheckinEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CHECKINS_KEY) ?? "[]");
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (typeof raw[0] === "number") {
      const migrated = (raw as number[]).map((day) => ({ day, at: dayToDate(day) }));
      writeCheckins(migrated);
      syncActivityFromCheckins(migrated);
      return migrated;
    }
    return raw as CheckinEntry[];
  } catch {
    return [];
  }
}

export function writeCheckins(entries: CheckinEntry[]) {
  localStorage.setItem(
    CHECKINS_KEY,
    JSON.stringify([...entries].sort((a, b) => a.day - b.day)),
  );
}

export function readActivity(): Record<string, DailyEntry> {
  try {
    return JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeActivity(data: Record<string, DailyEntry>) {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(data));
}

/** 合并写入某天的打卡 / 做题量 */
export function bumpDay(
  at: string,
  patch: { addCheckin?: number; addQuizzes?: number },
) {
  const all = readActivity();
  const cur = all[at] ?? { checkins: [], quizzes: 0 };
  if (patch.addCheckin != null && !cur.checkins.includes(patch.addCheckin)) {
    cur.checkins.push(patch.addCheckin);
  }
  if (patch.addQuizzes) cur.quizzes += patch.addQuizzes;
  all[at] = cur;
  writeActivity(all);
}

export function removeCheckin(day: number, at: string) {
  const all = readActivity();
  const cur = all[at];
  if (!cur) return;
  cur.checkins = cur.checkins.filter((d) => d !== day);
  if (cur.checkins.length === 0 && cur.quizzes === 0) delete all[at];
  else all[at] = cur;
  writeActivity(all);
}

export function syncActivityFromCheckins(entries: CheckinEntry[]) {
  const all = readActivity();
  for (const { day, at } of entries) {
    const cur = all[at] ?? { checkins: [], quizzes: 0 };
    if (!cur.checkins.includes(day)) cur.checkins.push(day);
    all[at] = cur;
  }
  writeActivity(all);
}

export function score(entry?: DailyEntry): number {
  if (!entry) return 0;
  return entry.checkins.length * 2 + entry.quizzes;
}

export function level(entry?: DailyEntry): 0 | 1 | 2 | 3 | 4 {
  const s = score(entry);
  if (s === 0) return 0;
  if (s <= 2) return 1;
  if (s <= 5) return 2;
  if (s <= 10) return 3;
  return 4;
}

export type HeatCell = { date: string; level: 0 | 1 | 2 | 3 | 4; label: string };

/** GitHub / ursb 式：53 列 × 7 行（Mon–Sun），平铺返回 */
export function buildHeatmapWeeks(weeks = 53): HeatCell[] {
  const activity = readActivity();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(start.getDate() - mondayOffset - (weeks - 1) * 7);

  const cells: HeatCell[] = [];
  const cursor = new Date(start);
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const key = todayKey(cursor);
      const entry = activity[key];
      const lv = level(entry);
      const label = entry
        ? `${key} · 打卡 ${entry.checkins.length} 天 · 做题 ${entry.quizzes} 道`
        : `${key} · 无记录`;
      cells.push({ date: key, level: lv, label });
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return cells;
}

/** 热力图窗口内有记录的天数 */
export function activeDayCountInWeeks(weeks = 53): number {
  return buildHeatmapWeeks(weeks).filter((c) => c.level > 0).length;
}
