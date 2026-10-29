import fs from "node:fs";
import path from "node:path";
import type { XingceIndex } from "./load";

/** 构建时读导入产物；还没跑 import:xingce 时页面仍可构建 */
export function readXingceIndex(): XingceIndex | null {
  const file = path.join(process.cwd(), "public/xingce/data/index.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as XingceIndex;
}
