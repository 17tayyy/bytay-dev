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
  }),
});

const about = defineCollection({
  loader: glob({ pattern: 'about.md', base: './src/content' }),
  schema: z.object({
    experience: z.array(z.object({
      role: z.string(),
      company: z.string(),
      period: z.string(),
      tags: z.array(z.string()).default([]),
      paragraphs: z.array(z.string()),
    })),
    education: z.array(z.object({
      degree: z.string(),
      institution: z.string().default(''),
      period: z.string(),
      description: z.string().default(''),
    })),
    training: z.array(z.object({
      title: z.string(),
      subtitle: z.string().default(''),
      description: z.string().default(''),
    })),
  }),
});

export const collections = { blog, about };
