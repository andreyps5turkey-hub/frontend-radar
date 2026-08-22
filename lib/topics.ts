import type { DigestItem } from "./digest";

export const topics = [
  { id: "react", label: "React", pattern: /react|redux|tanstack query/i },
  { id: "nextjs", label: "Next.js", pattern: /next\.js|nextjs|turbopack/i },
  { id: "typescript", label: "TypeScript", pattern: /typescript|typescript-go/i },
  { id: "vite", label: "Vite", pattern: /\bvite\b/i },
  { id: "storybook", label: "Storybook", pattern: /storybook/i },
  { id: "quality", label: "Качество кода", pattern: /eslint|prettier|качество кода|lint/i },
  { id: "platform", label: "Веб-платформа", pattern: /mdn|web\.dev|baseline|tc39|javascript|css/i },
] as const;

export type TopicId = (typeof topics)[number]["id"];

export function topicIdsForItem(item: DigestItem): TopicId[] {
  const haystack = `${item.title} ${item.source} ${item.tags.join(" ")}`;
  return topics.filter(({ pattern }) => pattern.test(haystack)).map(({ id }) => id);
}
