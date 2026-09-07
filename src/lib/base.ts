/** 拼接站点 base 与子路径（GitHub Pages 子路径下 BASE_URL 无尾斜杠） */
export function withBase(path = ""): string {
  const base = import.meta.env.BASE_URL;
  if (!path) return base.endsWith("/") ? base : `${base}/`;
  const clean = path.startsWith("/") ? path.slice(1) : path;
  if (base === "/") return `/${clean}`;
  return `${base.replace(/\/$/, "")}/${clean}`;
}
