import { withBase } from "../base";

const ALLOW = new Set([
  "p", "br", "img", "sub", "sup", "strong", "em", "b", "i",
  "table", "thead", "tbody", "tr", "td", "th", "span", "div", "ul", "ol", "li",
]);

/** 题干来自本地题库，仍只留白名单标签，图片地址限制在 xingce/img */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (full, raw, attrs = "") => {
    const tag = String(raw).toLowerCase();
    if (!ALLOW.has(tag)) return "";
    if (full.startsWith("</")) return tag === "br" ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "img") {
      const src = /src="([^"]+)"/.exec(attrs)?.[1] ?? "";
      if (!src.startsWith("xingce/img/")) return "";
      const width = /width="([^"]+)"/.exec(attrs)?.[1]?.replace(/[^\d.%px]/g, "") ?? "";
      const height = /height="([^"]+)"/.exec(attrs)?.[1]?.replace(/[^\d.%px]/g, "") ?? "";
      return `<img src="${withBase(src)}" alt=""${width ? ` width="${width}"` : ""}${height ? ` height="${height}"` : ""}>`;
    }
    return `<${tag}>`;
  });
}
