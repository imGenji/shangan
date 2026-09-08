import type { CollectionEntry } from "astro:content";

type Article = CollectionEntry<"articles">;

/** 已发布精讲篇的大纲标签 slug */
export function publishedTagSlugs(articles: Article[]): Set<string> {
  const out = new Set<string>();
  for (const a of articles) {
    if (a.data.day <= 0) continue;
    for (const slug of a.data.tags ?? []) out.add(slug);
  }
  return out;
}

/** 已有文章的八科 */
export function publishedTopics(articles: Article[]): Set<string> {
  const out = new Set<string>();
  for (const a of articles) {
    if (a.data.day <= 0 || !a.data.topic) continue;
    out.add(a.data.topic);
  }
  return out;
}
