import { coerce, diff, gt, intersects, minVersion, satisfies, valid, validRange } from "semver";
import type { ArchiveCatalog, ChangeType, DigestItem, RiskLevel } from "./digest";
import { topicIdsForItem, topics, type TopicId } from "./topics";

export const PROJECT_KEY = "frontend-radar:project:v1";
export const ACTIONS_KEY = "frontend-radar:action-state:v1";

export const packageRegistry = [
  { name: "react", label: "React", technologies: ["react"] },
  { name: "react-dom", label: "React DOM", technologies: ["react"] },
  { name: "next", label: "Next.js", technologies: ["nextjs", "react"] },
  { name: "typescript", label: "TypeScript", technologies: ["typescript"] },
  { name: "@typescript/native-preview", label: "TypeScript Native", technologies: ["typescript"] },
  { name: "vite", label: "Vite", technologies: ["vite"] },
  { name: "react-router", label: "React Router", technologies: ["router", "react"] },
  { name: "react-router-dom", label: "React Router DOM", technologies: ["router", "react"] },
  { name: "@reduxjs/toolkit", label: "Redux Toolkit", technologies: ["redux", "react"] },
  { name: "@tanstack/react-query", label: "TanStack Query", technologies: ["query", "react"] },
  { name: "storybook", label: "Storybook", technologies: ["storybook"] },
  { name: "@storybook/react", label: "Storybook React", technologies: ["storybook", "react"] },
  { name: "eslint", label: "ESLint", technologies: ["quality"] },
  { name: "prettier", label: "Prettier", technologies: ["quality"] },
] as const satisfies ReadonlyArray<{ name: string; label: string; technologies: readonly TopicId[] }>;

const packageTechnologyMap = new Map<string, readonly TopicId[]>(
  packageRegistry.map(({ name, technologies }) => [name, technologies]),
);

export type ProjectPackage = {
  name: string;
  version: string;
  sections: string[];
};

export type ProjectProfile = {
  version: 1;
  name: string;
  packages: ProjectPackage[];
  technologies: TopicId[];
  packageManager?: PackageManager;
  updatedAt: string;
};

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export type ActionStatus = "planned" | "done" | "dismissed";
export type ActionMap = Record<string, { status: ActionStatus; updatedAt: string }>;
export type RelevanceLevel = "exact" | "possible" | "related" | "none";

export type ProjectRelevance = {
  level: RelevanceLevel;
  label: string;
  reason: string;
  packages: string[];
  technologies: TopicId[];
};

type PackageManifest = {
  name?: unknown;
  packageManager?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  peerDependencies?: unknown;
  optionalDependencies?: unknown;
};

const dependencySections = ["dependencies", "optionalDependencies", "devDependencies", "peerDependencies"] as const;

const packageFamilies: Record<string, { family: string; sources: string[] }> = {
  react: { family: "react", sources: ["React Releases", "React Blog"] },
  "react-dom": { family: "react", sources: ["React Releases", "React Blog"] },
  next: { family: "next", sources: ["Next.js Releases", "Next.js Security"] },
  typescript: { family: "typescript", sources: ["TypeScript Blog", "typescript-go Releases"] },
  "@typescript/native-preview": { family: "typescript", sources: ["TypeScript Blog", "typescript-go Releases"] },
  vite: { family: "vite", sources: ["Vite Releases"] },
  "react-router": { family: "router", sources: ["React Router Releases"] },
  "react-router-dom": { family: "router", sources: ["React Router Releases"] },
  "@reduxjs/toolkit": { family: "redux", sources: ["Redux Toolkit Releases"] },
  "@tanstack/react-query": { family: "query", sources: ["TanStack Query Releases"] },
  storybook: { family: "storybook", sources: ["Storybook Releases"] },
  "@storybook/react": { family: "storybook", sources: ["Storybook Releases"] },
  eslint: { family: "eslint", sources: ["ESLint Releases"] },
  prettier: { family: "prettier", sources: ["Prettier Releases"] },
};

export type VersionSignalStatus = "security" | "major" | "minor" | "patch" | "current" | "unknown";

export type VersionSignal = {
  package: ProjectPackage;
  family: string;
  currentVersion: string | null;
  latestVersion: string | null;
  latestVersionLabel: string | null;
  status: VersionSignalStatus;
  confidence: "source" | "inferred" | "unknown";
  item: DigestItem | null;
  issueDate: string | null;
};

type ReleaseCandidate = {
  item: DigestItem;
  issueDate: string;
  versionLabel: string | null;
  version: string | null;
  confidence: "source" | "inferred";
};

function packageManagerFrom(value: unknown): PackageManager | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.split("@")[0];
  return ["pnpm", "npm", "yarn", "bun"].includes(name) ? name as PackageManager : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function technologiesForPackage(name: string): TopicId[] {
  return [...(packageTechnologyMap.get(name.trim().toLowerCase()) ?? [])];
}

export function parseProjectManifest(text: string, now = new Date().toISOString()) {
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(text) as PackageManifest;
  } catch {
    throw new Error("Файл не похож на корректный package.json.");
  }
  if (!isRecord(manifest)) throw new Error("В package.json должен быть объект с зависимостями.");

  const found = new Map<string, ProjectPackage>();
  const dependencyNames = new Set<string>();
  for (const section of dependencySections) {
    const dependencies = manifest[section];
    if (!isRecord(dependencies)) continue;
    for (const [rawName, rawVersion] of Object.entries(dependencies)) {
      if (typeof rawVersion !== "string") continue;
      const name = rawName.trim().toLowerCase();
      dependencyNames.add(name);
      if (!packageTechnologyMap.has(name)) continue;
      const current = found.get(name);
      if (current) {
        if (!current.sections.includes(section)) current.sections.push(section);
      } else {
        found.set(name, { name, version: rawVersion.trim(), sections: [section] });
      }
    }
  }

  const packages = [...found.values()].sort((left, right) => left.name.localeCompare(right.name));
  const technologies = [...new Set(packages.flatMap(({ name }) => technologiesForPackage(name)))];
  return {
    profile: {
      version: 1 as const,
      name: typeof manifest.name === "string" && manifest.name.trim() ? manifest.name.trim() : "Мой проект",
      packages,
      technologies,
      packageManager: packageManagerFrom(manifest.packageManager),
      updatedAt: now,
    },
    ignored: Math.max(0, dependencyNames.size - packages.length),
  };
}

export function createEmptyProject(now = new Date().toISOString()): ProjectProfile {
  return { version: 1, name: "Мой проект", packages: [], technologies: [], packageManager: "pnpm", updatedAt: now };
}

export function readProjectProfile(value: string): ProjectProfile | null {
  try {
    const profile = JSON.parse(value) as Partial<ProjectProfile>;
    if (profile.version !== 1 || typeof profile.name !== "string" || !Array.isArray(profile.packages) || !Array.isArray(profile.technologies)) return null;
    const validTopics = new Set(topics.map(({ id }) => id));
    return {
      version: 1,
      name: profile.name.trim() || "Мой проект",
      packages: profile.packages.filter((entry): entry is ProjectPackage => Boolean(entry)
        && typeof entry.name === "string"
        && typeof entry.version === "string"
        && Array.isArray(entry.sections)),
      technologies: profile.technologies.filter((topic): topic is TopicId => validTopics.has(topic as TopicId)),
      packageManager: packageManagerFrom(profile.packageManager),
      updatedAt: typeof profile.updatedAt === "string" ? profile.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

function semverMatch(projectVersion: string, affectedRange: string) {
  const exact = valid(projectVersion);
  const affected = validRange(affectedRange);
  if (!affected) return "none" as const;
  if (exact) return satisfies(exact, affected, { includePrerelease: true }) ? "exact" as const : "none" as const;
  const projectRange = validRange(projectVersion);
  if (!projectRange) return "none" as const;
  return intersects(projectRange, affected, { includePrerelease: true }) ? "possible" as const : "none" as const;
}

export function relevanceForItem(item: DigestItem, project: ProjectProfile | null): ProjectRelevance {
  if (!project) return { level: "none", label: "", reason: "", packages: [], technologies: [] };

  const projectPackages = new Map(project.packages.map((entry) => [entry.name.toLowerCase(), entry]));
  const matches = (item.packages ?? []).flatMap((itemPackage) => {
    const projectPackage = projectPackages.get(itemPackage.name.toLowerCase());
    return projectPackage ? [{ itemPackage, projectPackage }] : [];
  });
  for (const { itemPackage, projectPackage } of matches) {
    if (!itemPackage.affectedRange) continue;
    const match = semverMatch(projectPackage.version, itemPackage.affectedRange);
    if (match === "exact") {
      return {
        level: "exact",
        label: "Затрагивает ваш стек",
        reason: `${itemPackage.name} ${projectPackage.version} входит в диапазон ${itemPackage.affectedRange}`,
        packages: matches.map(({ itemPackage: entry }) => entry.name),
        technologies: topicIdsForItem(item),
      };
    }
    if (match === "possible") {
      return {
        level: "possible",
        label: "Возможно затрагивает",
        reason: `Диапазон ${projectPackage.version} пересекается с ${itemPackage.affectedRange}`,
        packages: matches.map(({ itemPackage: entry }) => entry.name),
        technologies: topicIdsForItem(item),
      };
    }
  }

  if (matches.length) {
    return {
      level: "related",
      label: "По пакету проекта",
      reason: matches.map(({ itemPackage }) => itemPackage.name).join(", "),
      packages: matches.map(({ itemPackage }) => itemPackage.name),
      technologies: topicIdsForItem(item),
    };
  }

  const itemTopics = topicIdsForItem(item);
  const matchedTopics = itemTopics.filter((topic) => project.technologies.includes(topic));
  if (matchedTopics.length) {
    const labels = new Map(topics.map(({ id, label }) => [id, label]));
    return {
      level: "related",
      label: "По теме проекта",
      reason: matchedTopics.map((topic) => labels.get(topic) ?? topic).join(", "),
      packages: [],
      technologies: matchedTopics,
    };
  }

  return { level: "none", label: "", reason: "", packages: [], technologies: [] };
}

export function isRecommendedAction(item: DigestItem, issueDate: string, latestDate: string, project: ProjectProfile | null) {
  if (relevanceForItem(item, project).level === "none") return false;
  if (item.priority === "P0" || item.changeType === "security") return true;
  const recentBoundary = Date.parse(`${latestDate}T12:00:00Z`) - 29 * 86400000;
  const isRecent = Date.parse(`${issueDate}T12:00:00Z`) >= recentBoundary;
  return isRecent && (item.priority === "P1" || item.changeType === "breaking" || item.changeType === "major");
}

export function readActionMap(value: string): ActionMap {
  try {
    const parsed = JSON.parse(value) as ActionMap;
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, entry]) => entry
      && ["planned", "done", "dismissed"].includes(entry.status)
      && typeof entry.updatedAt === "string"));
  } catch {
    return {};
  }
}

export const changeTypeOptions: Array<{ value: ChangeType; label: string }> = [
  { value: "security", label: "Безопасность" },
  { value: "breaking", label: "Ломающие изменения" },
  { value: "major", label: "Major-релизы" },
  { value: "minor", label: "Обновления" },
  { value: "tooling", label: "Инструменты" },
  { value: "guide", label: "Практика" },
  { value: "standard", label: "Веб-платформа" },
];

export const riskOptions: Array<{ value: RiskLevel; label: string }> = [
  { value: "critical", label: "Критический" },
  { value: "high", label: "Высокий" },
  { value: "medium", label: "Средний" },
  { value: "low", label: "Низкий" },
  { value: "unknown", label: "Не определён" },
];

export function allCatalogItems(catalog: ArchiveCatalog) {
  const seen = new Set<string>();
  return catalog.issues.flatMap((issue) => [...issue.items, ...issue.readLater].flatMap((item) => {
    if (seen.has(item.url)) return [];
    seen.add(item.url);
    return [{ item, issueDate: issue.date }];
  }));
}

function normalizedVersion(value: string | null | undefined) {
  if (!value) return null;
  return valid(value)?.toString() ?? coerce(value)?.toString() ?? null;
}

function currentVersion(value: string) {
  return valid(value)?.toString() ?? minVersion(value)?.toString() ?? null;
}

function inferredVersion(item: DigestItem) {
  const match = item.title.match(/(?:^|\s)v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)(?:\b|$)/);
  return match?.[1] ?? null;
}

function signalStatus(current: string | null, latest: string | null, item: DigestItem | null): VersionSignalStatus {
  if (item?.changeType === "security" || item?.priority === "P0" || item?.risk === "critical" || item?.risk === "high") return "security";
  if (!current || !latest) return "unknown";
  if (!gt(latest, current)) return "current";
  const difference = diff(current, latest);
  if (difference === "major" || difference === "premajor") return "major";
  if (difference === "minor" || difference === "preminor") return "minor";
  return "patch";
}

export function buildVersionRadar(catalog: ArchiveCatalog, project: ProjectProfile | null): VersionSignal[] {
  if (!project) return [];
  const items = allCatalogItems(catalog);

  return project.packages.map((projectPackage) => {
    const config = packageFamilies[projectPackage.name.toLowerCase()] ?? { family: projectPackage.name, sources: [] };
    const candidates = items.flatMap<ReleaseCandidate>(({ item, issueDate }) => {
      const explicit = item.packages?.find(({ name }) => name.toLowerCase() === projectPackage.name.toLowerCase());
      const explicitLabel = explicit?.releasedVersion ?? explicit?.fixedVersion ?? null;
      if (explicit) return [{ item, issueDate, versionLabel: explicitLabel, version: normalizedVersion(explicitLabel), confidence: "source" as const }];
      if (!config.sources.includes(item.source)) return [];
      const versionLabel = inferredVersion(item);
      if (!versionLabel && item.changeType !== "security" && item.priority !== "P0") return [];
      return [{ item, issueDate, versionLabel, version: normalizedVersion(versionLabel), confidence: "inferred" as const }];
    });

    candidates.sort((left, right) => {
      const leftSecurity = signalStatus(null, null, left.item) === "security" ? 1 : 0;
      const rightSecurity = signalStatus(null, null, right.item) === "security" ? 1 : 0;
      if (leftSecurity !== rightSecurity) return rightSecurity - leftSecurity;
      if (left.version && right.version && left.version !== right.version) return gt(left.version, right.version) ? -1 : 1;
      return right.issueDate.localeCompare(left.issueDate);
    });

    const latest = candidates[0] ?? null;
    const installed = currentVersion(projectPackage.version);
    return {
      package: projectPackage,
      family: config.family,
      currentVersion: installed,
      latestVersion: latest?.version ?? null,
      latestVersionLabel: latest?.versionLabel ?? null,
      status: signalStatus(installed, latest?.version ?? null, latest?.item ?? null),
      confidence: latest?.confidence ?? "unknown",
      item: latest?.item ?? null,
      issueDate: latest?.issueDate ?? null,
    };
  }).sort((left, right) => {
    const rank: Record<VersionSignalStatus, number> = { security: 0, major: 1, minor: 2, patch: 3, current: 4, unknown: 5 };
    return rank[left.status] - rank[right.status] || left.package.name.localeCompare(right.package.name);
  });
}

export function buildUpgradeCommand(signals: VersionSignal[], manager: PackageManager) {
  const updates = signals.filter((signal) => ["major", "minor", "patch", "security"].includes(signal.status) && signal.latestVersionLabel);
  const production = updates.filter(({ package: entry }) => entry.sections.some((section) => ["dependencies", "optionalDependencies", "manual"].includes(section)));
  const development = updates.filter((signal) => !production.includes(signal));
  const targets = (entries: VersionSignal[]) => entries.map(({ package: entry, latestVersionLabel }) => `${entry.name}@${latestVersionLabel}`).join(" ");
  const commands: string[] = [];

  if (production.length) {
    if (manager === "npm") commands.push(`npm install ${targets(production)}`);
    else commands.push(`${manager} add ${targets(production)}`);
  }
  if (development.length) {
    if (manager === "npm") commands.push(`npm install --save-dev ${targets(development)}`);
    else commands.push(`${manager} add -D ${targets(development)}`);
  }
  return commands.join("\n");
}
