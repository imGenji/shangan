import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { SYLLABUS_TAG_SLUGS } from "./data/syllabus";

/** 法考八大应试科目，学习计划按客观分值 + 主观权重分配天数 */
export const SUBJECTS = [
  "理论法",
  "刑法",
  "刑诉法",
  "行政法",
  "民法",
  "民诉法",
  "商经知",
  "三国法",
] as const;

const chapter = z.object({
  id: z.string(),
  num: z.union([z.number(), z.string()]),
  title: z.string(),
});

const articles = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/articles" }),
  schema: z
    .object({
      title: z.string(),
      summary: z.string(),
      /** 0 = 开篇总览，其余为计划序号 */
      day: z.number().int().min(0),
      /** 所属八科 */
      topic: z.enum(SUBJECTS).optional(),
      /** 大纲考点标签（slug，见 syllabus.ts） */
      tags: z.array(z.enum(SYLLABUS_TAG_SLUGS)).default([]),
      /** 本篇覆盖范围，如「民法总则」 */
      scope: z.string().optional(),
      date: z.coerce.date(),
      template: z.enum(["default", "immersive"]).default("default"),
      readMinutes: z.number().int().positive().optional(),
      chapters: z.array(chapter).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.day <= 0) return;
      if (!data.topic) {
        ctx.addIssue({ code: "custom", message: "精讲篇需指定 topic（八科）", path: ["topic"] });
      }
      if (!data.tags.length) {
        ctx.addIssue({ code: "custom", message: "精讲篇需至少一个 tags（大纲标签）", path: ["tags"] });
      }
    }),
});

export const collections = { articles };
