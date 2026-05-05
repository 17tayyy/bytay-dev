import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    pinned: z.boolean().default(false),
    // Optional per-post OG image. Can be an absolute URL or a /public-relative path.
    image: z.string().optional(),
  }),
});

const about = defineCollection({
  loader: glob({ pattern: 'about.md', base: './src/content' }),
  schema: z.object({}),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = { blog, about, projects };
