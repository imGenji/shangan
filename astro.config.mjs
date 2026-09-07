// @ts-check
import { defineConfig } from "astro/config";

import mdx from "@astrojs/mdx";

// 部署到 GitHub Pages 项目仓库时路径带仓库名，由 CI 注入 BASE_PATH；
// 换成自定义域名后不设即可。
export default defineConfig({
  site: "https://imGenji.github.io",
  base: process.env.BASE_PATH,
  integrations: [mdx()],
});