import type { CollectionEntry } from "astro:content";
import { TOPICS } from "./topics";

export function tagSlug(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, "-");
}

export function getAllTags(posts: CollectionEntry<"blog">[]) {
  return TOPICS.map((tag) => ({
    tag,
    slug: tagSlug(tag),
    count: posts.filter((post) => post.data.tags.includes(tag)).length,
  })).filter(({ count }) => count > 0);
}

export function getPostsByTagSlug(
  posts: CollectionEntry<"blog">[],
  slug: string,
) {
  return posts.filter((post) =>
    post.data.tags.some((tag) => tagSlug(tag) === slug),
  );
}

export function getRelatedPosts(
  current: CollectionEntry<"blog">,
  posts: CollectionEntry<"blog">[],
  limit = 2,
) {
  const currentTags = new Set(current.data.tags.map(tagSlug));
  return posts
    .filter((post) => post.id !== current.id)
    .map((post) => ({
      post,
      shared: post.data.tags.filter((t) => currentTags.has(tagSlug(t))).length,
    }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => {
      if (b.shared !== a.shared) return b.shared - a.shared;
      return b.post.data.date.valueOf() - a.post.data.date.valueOf();
    })
    .slice(0, limit)
    .map(({ post }) => post);
}
