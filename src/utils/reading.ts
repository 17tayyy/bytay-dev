const WORDS_PER_MINUTE = 220;

export function readingTime(body: string | undefined): string {
  if (!body) return "1 min read";
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}
