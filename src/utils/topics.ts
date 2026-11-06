export const TOPICS = ["AI", "Python", "Rust", "Security", "Tooling", "Benchmarks"] as const;

export type Topic = (typeof TOPICS)[number];
