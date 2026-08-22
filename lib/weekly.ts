import type { ArchiveCatalog, Digest, DigestItem, Priority } from "./digest";
import { topicIdsForItem, topics, type TopicId } from "./topics";

const DAY_MS = 24 * 60 * 60 * 1000;
const priorityRank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export type WeeklyMaterial = {
  item: DigestItem;
  issueDate: string;
  section: "attention" | "later";
};

export type WeeklyTopic = {
  id: TopicId;
  label: string;
  count: number;
};

export type WeeklyDigest = {
  startDate: string;
  endDate: string;
  issues: Digest[];
  materials: WeeklyMaterial[];
  highlights: WeeklyMaterial[];
  priorityCounts: Record<Priority, number>;
  topics: WeeklyTopic[];
  importantCount: number;
  activeDays: number;
  sourceHealth: {
    attempted: number;
    succeeded: number;
    detailedIssues: number;
    legacyIssues: number;
  };
};

function toDateValue(value: string) {
  return Date.parse(`${value}T12:00:00Z`);
}

function dateFromValue(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

export function buildWeeklyDigest(catalog: ArchiveCatalog, days = 7): WeeklyDigest {
  const latest = catalog.issues[0];
  if (!latest) throw new Error("Weekly digest requires at least one archive issue.");

  const endValue = toDateValue(latest.date);
  const startValue = endValue - (days - 1) * DAY_MS;
  const issues = catalog.issues.filter(({ date }) => {
    const value = toDateValue(date);
    return value >= startValue && value <= endValue;
  });

  const materials: WeeklyMaterial[] = [];
  const seenUrls = new Set<string>();
  for (const issue of issues) {
    const entries = [
      ...issue.items.map((item) => ({ item, section: "attention" as const })),
      ...issue.readLater.map((item) => ({ item, section: "later" as const })),
    ];
    for (const entry of entries) {
      if (seenUrls.has(entry.item.url)) continue;
      seenUrls.add(entry.item.url);
      materials.push({ ...entry, issueDate: issue.date });
    }
  }

  const priorityCounts: Record<Priority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const topicCounts = new Map<TopicId, number>();
  for (const { item } of materials) {
    priorityCounts[item.priority] += 1;
    for (const topic of topicIdsForItem(item)) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }

  const highlights = [...materials]
    .sort((left, right) => {
      const priorityDifference = priorityRank[left.item.priority] - priorityRank[right.item.priority];
      if (priorityDifference) return priorityDifference;
      return Date.parse(right.item.publishedAt) - Date.parse(left.item.publishedAt);
    })
    .slice(0, 7);

  const detailedIssues = issues.filter(({ sourceHealth }) => sourceHealth);
  const sourceHealth = detailedIssues.reduce((total, issue) => ({
    attempted: total.attempted + (issue.sourceHealth?.attempted ?? 0),
    succeeded: total.succeeded + (issue.sourceHealth?.succeeded ?? 0),
    detailedIssues: total.detailedIssues + 1,
    legacyIssues: total.legacyIssues,
  }), {
    attempted: 0,
    succeeded: 0,
    detailedIssues: 0,
    legacyIssues: issues.length - detailedIssues.length,
  });

  return {
    startDate: dateFromValue(startValue),
    endDate: latest.date,
    issues,
    materials,
    highlights,
    priorityCounts,
    topics: topics
      .map(({ id, label }) => ({ id, label, count: topicCounts.get(id) ?? 0 }))
      .filter(({ count }) => count > 0)
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ru")),
    importantCount: priorityCounts.P0 + priorityCounts.P1,
    activeDays: issues.filter(({ status }) => status === "active").length,
    sourceHealth,
  };
}

export function formatWeeklyRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00+03:00`);
  const end = new Date(`${endDate}T12:00:00+03:00`);
  const startMonth = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "Europe/Moscow" }).format(start);
  const endMonth = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "Europe/Moscow" }).format(end);
  const year = new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone: "Europe/Moscow" }).format(end);
  if (startMonth === endMonth) return `${start.getDate()}–${end.getDate()} ${endMonth} ${year}`;
  return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth} ${year}`;
}

export function weeklySummary(weekly: WeeklyDigest) {
  if (weekly.priorityCounts.P0 > 0) {
    return `За неделю найдено срочных событий P0: ${weekly.priorityCounts.P0}. Начните с них.`;
  }
  if (weekly.importantCount > 0) {
    return `За неделю отобрано важных материалов P1: ${weekly.importantCount}. Остальное можно читать по мере необходимости.`;
  }
  return "Неделя прошла без сигналов P0–P1. В подборке остались полезные обновления инструментов и материалы на потом.";
}
