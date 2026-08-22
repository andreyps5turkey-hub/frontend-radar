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

export type WeeklyTopicChange = {
  id: TopicId;
  label: string;
  current: number;
  previous: number;
  delta: number;
  direction: "new" | "rising" | "quiet";
};

export type WeeklyComparison = {
  current: WeeklyDigest;
  previous: WeeklyDigest;
  hasBaseline: boolean;
  deltas: {
    materials: number;
    important: number;
    activeDays: number;
    sourceHealthPoints: number | null;
  };
  topicChanges: WeeklyTopicChange[];
};

function toDateValue(value: string) {
  return Date.parse(`${value}T12:00:00Z`);
}

function dateFromValue(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function buildWeeklyWindow(catalog: ArchiveCatalog, endDate: string, days: number): WeeklyDigest {
  const endValue = toDateValue(endDate);
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
    endDate,
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

export function buildWeeklyDigest(catalog: ArchiveCatalog, days = 7): WeeklyDigest {
  const latest = catalog.issues[0];
  if (!latest) throw new Error("Weekly digest requires at least one archive issue.");
  return buildWeeklyWindow(catalog, latest.date, days);
}

function healthPercent(weekly: WeeklyDigest) {
  return weekly.sourceHealth.attempted
    ? Math.round((weekly.sourceHealth.succeeded / weekly.sourceHealth.attempted) * 100)
    : null;
}

export function buildWeeklyComparison(catalog: ArchiveCatalog, days = 7): WeeklyComparison {
  const current = buildWeeklyDigest(catalog, days);
  const previousEnd = dateFromValue(toDateValue(current.startDate) - DAY_MS);
  const previous = buildWeeklyWindow(catalog, previousEnd, days);
  const currentHealth = healthPercent(current);
  const previousHealth = healthPercent(previous);
  const currentTopics = new Map(current.topics.map((topic) => [topic.id, topic.count]));
  const previousTopics = new Map(previous.topics.map((topic) => [topic.id, topic.count]));
  const topicChanges = topics.flatMap(({ id, label }) => {
    const currentCount = currentTopics.get(id) ?? 0;
    const previousCount = previousTopics.get(id) ?? 0;
    const delta = currentCount - previousCount;
    if (!delta) return [];
    return [{
      id,
      label,
      current: currentCount,
      previous: previousCount,
      delta,
      direction: previousCount === 0 && currentCount > 0 ? "new" as const : delta > 0 ? "rising" as const : "quiet" as const,
    }];
  }).sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.label.localeCompare(right.label, "ru"));

  return {
    current,
    previous,
    hasBaseline: previous.issues.length >= 3,
    deltas: {
      materials: current.materials.length - previous.materials.length,
      important: current.importantCount - previous.importantCount,
      activeDays: current.activeDays - previous.activeDays,
      sourceHealthPoints: currentHealth === null || previousHealth === null ? null : currentHealth - previousHealth,
    },
    topicChanges,
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
