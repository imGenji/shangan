import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/** 行测五大题型，学习计划按这五类的真题占比分配天数 */
export const TOPICS = [
  "常识判断",
  "言语理解与表达",
  "数量关系",
  "判断推理",
  "资料分析",
] as const;

const articles = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    /** 0 = 开篇章，其余为计划第几天 */
    day: z.number().int().min(0),
    topic: z.enum(TOPICS).optional(),
    date: z.coerce.date(),
    template: z.enum(["default", "immersive"]).default("default"),
    readMinutes: z.number().int().positive().optional(),
  }),
});

export const collections = { articles };
