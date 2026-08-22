export type Priority = "P0" | "P1" | "P2" | "P3";

export type DigestItem = {
  priority: Priority;
  title: string;
  source: string;
  publishedAt: string;
  whyImportant: string;
  audience: string;
  nextStep: string;
  url: string;
  tags: string[];
};

export type SourceHealth = {
  attempted: number;
  succeeded: number;
  failed: string[];
};

export type Digest = {
  date: string;
  generatedAt: string;
  timezone: "Europe/Moscow";
  windowHours: number;
  status: "active" | "quiet";
  summary: string;
  items: DigestItem[];
  readLater: DigestItem[];
  sourcesChecked: number;
  sourceHealth?: SourceHealth;
};

export type ArchiveCatalog = {
  version: 1;
  updatedAt: string;
  issues: Digest[];
};

export const priorityLabels: Record<Priority, string> = {
  P0: "Срочно",
  P1: "Важно",
  P2: "Инструменты",
  P3: "На потом",
};

export function formatIssueDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(`${value}T12:00:00+03:00`));
}

export function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

export function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

export function itemAnchor(url: string) {
  let hash = 5381;
  for (let index = 0; index < url.length; index += 1) {
    hash = ((hash << 5) + hash) ^ url.charCodeAt(index);
  }
  return `material-${(hash >>> 0).toString(36)}`;
}

export function formatMaterialCount(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun = mod100 >= 11 && mod100 <= 14
    ? "материалов"
    : mod10 === 1
      ? "материал"
      : mod10 >= 2 && mod10 <= 4
        ? "материала"
        : "материалов";
  return `${count} ${noun}`;
}
