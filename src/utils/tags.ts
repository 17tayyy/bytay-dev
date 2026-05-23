import type { CollectionEntry } from "astro:content";

export function tagSlug(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, "-");
}

export function getAllTags(posts: CollectionEntry<"blog">[]) {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      const slug = tagSlug(tag);
      const existing = counts.get(slug);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(slug, { tag, count: 1 });
      }
    }
  }
  return Array.from(counts.entries())
    .map(([slug, { tag, count }]) => ({ slug, tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
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
