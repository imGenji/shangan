import { withBase } from "./base";

/** 文章目录 · 按科目筛选 */
export function planTopicUrl(topic: string): string {
  return withBase(`plan/?topic=${encodeURIComponent(topic)}`);
}

/** 文章目录 · 按大纲标签筛选 */
export function planTagUrl(slug: string): string {
  return withBase(`plan/?tag=${encodeURIComponent(slug)}`);
}

export function planAllUrl(): string {
  return withBase("plan/");
}
