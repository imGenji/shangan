/** 客观题精讲目标篇数（不含总览） */
export const PLANNED_ARTICLES = 200;

/** 顶栏品牌名 */
export const SITE_BRAND = "法考";

/** 默认 SEO 描述 */
export const SITE_DESCRIPTION = `${PLANNED_ARTICLES} 篇客观题精讲 · 2027 法考`;

/** day=0 为总览，其余为序号 */
export function articleLabel(day: number): string {
  if (day === 0) return "总览";
  return `第 ${String(day).padStart(2, "0")} 篇`;
}
