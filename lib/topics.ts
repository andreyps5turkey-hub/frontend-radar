import type { DigestItem } from "./digest";

export const topics = [
  { id: "react", label: "React", pattern: /\breact(?:\.js)?\b/i },
  { id: "nextjs", label: "Next.js", pattern: /next\.js|nextjs|turbopack/i },
  { id: "typescript", label: "TypeScript", pattern: /typescript|typescript-go/i },
  { id: "vite", label: "Vite", pattern: /\bvite\b/i },
  { id: "router", label: "React Router", pattern: /react router|react-router/i },
  { id: "redux", label: "Redux Toolkit", pattern: /redux|@reduxjs\/toolkit/i },
  { id: "query", label: "TanStack Query", pattern: /tanstack query|@tanstack\/react-query/i },
  { id: "storybook", label: "Storybook", pattern: /storybook/i },
  { id: "quality", label: "Качество кода", pattern: /eslint|prettier|качество кода|lint/i },
  { id: "platform", label: "Веб-платформа", pattern: /mdn|web\.dev|baseline|tc39|javascript|css/i },
] as const;

export type TopicId = (typeof topics)[number]["id"];

export function topicIdsForItem(item: DigestItem): TopicId[] {
  const haystack = `${item.title} ${item.source} ${item.tags.join(" ")}`;
  const inferred = topics.filter(({ pattern }) => pattern.test(haystack)).map(({ id }) => id);
  return [...new Set([...(item.technologies ?? []), ...inferred])];
}
