import {
  compare,
  diff,
  gt,
  lte,
  major,
  prerelease,
  rcompare,
  satisfies,
  valid,
} from "semver";
import type {
  CompatibilityRule,
  PackageAdvisory,
  PackageCatalogV1,
  PackageEvent,
  PackageIntelligence,
  PackageVersion,
  TrackedPackage,
} from "./package-catalog";
import type { PackageManager } from "./project";

export type ComparisonAdvisory = {
  advisory: PackageAdvisory;
  state: "resolved" | "active" | "introduced";
  fixedVersion: string | null;
};

export type VersionComparison = {
  packageInfo: PackageIntelligence;
  currentVersion: string;
  targetVersion: string;
  changeKind: "major" | "minor" | "patch";
  releases: PackageVersion[];
  events: PackageEvent[];
  advisories: ComparisonAdvisory[];
  targetRule: CompatibilityRule | null;
  requirements: string[];
  warnings: string[];
  checklist: string[];
  commands: Record<PackageManager, string>;
};

export type MigrationDefinition = {
  slug: string;
  label: string;
  transition: string;
  fromMajor: number;
  toMajor: number;
  fromVersion: string;
  toVersion: string;
};

function primaryPackage(item: PackageIntelligence) {
  return item.packages.find(({ name }) => name === item.primaryPackage) ?? item.packages[0] ?? null;
}

function cleanRange(value: string) {
  return value.replace(/,\s*/g, " ").trim();
}

function stableVersions(tracked: TrackedPackage | null) {
  const seen = new Set<string>();
  return (tracked?.versions ?? [])
    .filter(({ version }) => valid(version) && prerelease(version) === null && !seen.has(version) && seen.add(version))
    .sort((left, right) => rcompare(left.version, right.version));
}

export function comparisonVersions(item: PackageIntelligence) {
  return stableVersions(primaryPackage(item));
}

function ruleForVersion(tracked: TrackedPackage | null, version: string) {
  return tracked?.compatibility.find(({ range }) => satisfies(version, range, { includePrerelease: false })) ?? null;
}

function advisoryState(advisory: PackageAdvisory, item: PackageIntelligence, currentVersion: string, targetVersion: string): ComparisonAdvisory | null {
  const matching = advisory.vulnerabilities.filter(({ packageName }) => packageName === item.primaryPackage);
  if (!matching.length) return null;
  const currentAffected = matching.some(({ vulnerableRange }) => satisfies(currentVersion, cleanRange(vulnerableRange)));
  const targetAffected = matching.some(({ vulnerableRange }) => satisfies(targetVersion, cleanRange(vulnerableRange)));
  if (!currentAffected && !targetAffected) return null;
  return {
    advisory,
    state: targetAffected ? (currentAffected ? "active" : "introduced") : "resolved",
    fixedVersion: matching.find(({ fixedVersion }) => fixedVersion)?.fixedVersion ?? null,
  };
}

function comparisonChecklist(slug: string) {
  const checks = new Set<string>([
    "Запустить существующие автоматические тесты.",
    "Собрать production-версию в отдельной ветке.",
  ]);
  if (["react", "next"].includes(slug)) {
    checks.add("Проверить hydration, SSR и React Server Components, если они используются.");
    checks.add("Проверить основные маршруты и обработку ошибок.");
  }
  if (slug === "typescript") checks.add("Запустить typecheck и проверить новые диагностические сообщения.");
  if (slug === "vite") checks.add("Проверить dev-сервер, динамические импорты и production bundle.");
  if (slug === "react-router") checks.add("Проверить loaders/actions и прямое открытие вложенных маршрутов.");
  if (slug === "storybook") checks.add("Собрать Storybook и открыть ключевые stories.");
  if (slug === "eslint") checks.add("Запустить lint и просмотреть изменения набора правил.");
  if (slug === "prettier") checks.add("Проверить форматирование на отдельной ветке и просмотреть diff.");
  return [...checks];
}

function managerCommands(packageName: string, version: string): Record<PackageManager, string> {
  const target = `${packageName}@${version}`;
  return {
    pnpm: `pnpm add ${target}`,
    npm: `npm install ${target}`,
    yarn: `yarn add ${target}`,
    bun: `bun add ${target}`,
  };
}

function changeKind(currentVersion: string, targetVersion: string) {
  const value = diff(currentVersion, targetVersion);
  if (value === "major" || value === "premajor") return "major" as const;
  if (value === "minor" || value === "preminor") return "minor" as const;
  return "patch" as const;
}

export function buildVersionComparison(catalog: PackageCatalogV1, slug: string, current: string, target: string): VersionComparison | null {
  const packageInfo = catalog.packages.find((item) => item.slug === slug);
  const currentVersion = valid(current);
  const targetVersion = valid(target);
  if (!packageInfo || !currentVersion || !targetVersion || !gt(targetVersion, currentVersion)) return null;
  const tracked = primaryPackage(packageInfo);
  const releases = comparisonVersions(packageInfo)
    .filter(({ version }) => gt(version, currentVersion) && lte(version, targetVersion))
    .sort((left, right) => compare(left.version, right.version));
  const targetRule = ruleForVersion(tracked, targetVersion);
  const requirements = [
    ...(targetRule?.nodeRange ? [`Node.js ${targetRule.nodeRange}`] : []),
    ...Object.entries(targetRule?.peerDependencies ?? {}).map(([name, range]) => `${name} ${range}`),
  ];
  const warnings = [
    ...(targetRule ? [] : ["Для целевой версии нет точного правила peerDependencies или engines."]),
    ...(targetRule?.deprecated ? [`Целевая линия помечена deprecated: ${targetRule.deprecated}`] : []),
  ];
  const events = packageInfo.events
    .filter(({ version }) => version && valid(version) && gt(version, currentVersion) && lte(version, targetVersion))
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  const advisories = packageInfo.advisories.flatMap((advisory) => {
    const matched = advisoryState(advisory, packageInfo, currentVersion, targetVersion);
    return matched ? [matched] : [];
  });
  return {
    packageInfo,
    currentVersion,
    targetVersion,
    changeKind: changeKind(currentVersion, targetVersion),
    releases,
    events,
    advisories,
    targetRule,
    requirements,
    warnings,
    checklist: comparisonChecklist(packageInfo.slug),
    commands: managerCommands(packageInfo.primaryPackage, targetVersion),
  };
}

export function comparisonPullRequestMarkdown(comparison: VersionComparison, manager: PackageManager) {
  const resolved = comparison.advisories.filter(({ state }) => state === "resolved");
  const active = comparison.advisories.filter(({ state }) => state !== "resolved");
  const lines = [
    `# Обновить ${comparison.packageInfo.label}: ${comparison.currentVersion} → ${comparison.targetVersion}`,
    "",
    "## Что меняется",
    "",
    `- Переход: **${comparison.changeKind}**`,
    `- Стабильных релизов в диапазоне: **${comparison.releases.length}**`,
    `- Команда: \`${comparison.commands[manager]}\``,
  ];
  if (resolved.length) lines.push(`- Закрывается advisory: ${resolved.map(({ advisory }) => advisory.ghsaId).join(", ")}`);
  if (active.length) lines.push(`- Требуют ручной проверки: ${active.map(({ advisory }) => advisory.ghsaId).join(", ")}`);
  if (comparison.requirements.length) lines.push("", "## Требования целевой версии", "", ...comparison.requirements.map((item) => `- ${item}`));
  if (comparison.events.length) lines.push("", "## Важные события", "", ...comparison.events.map((event) => `- [${event.title}](${event.url}) — ${event.summary}`));
  if (comparison.warnings.length) lines.push("", "## Ручная проверка", "", ...comparison.warnings.map((item) => `- ${item}`));
  lines.push(
    "",
    "## Проверка",
    "",
    ...comparison.checklist.map((item) => `- [ ] ${item}`),
    "",
    `Официальный источник: ${comparison.packageInfo.repositoryUrl}`,
    "",
    "> Сформировано Frontend Radar. Перед слиянием сверьте breaking changes с официальными release notes.",
  );
  return lines.join("\n");
}

export function migrationDefinitions(catalog: PackageCatalogV1): MigrationDefinition[] {
  return catalog.packages.flatMap((item) => {
    const versions = comparisonVersions(item);
    const majors = [...new Set(versions.map(({ version }) => major(version)))].sort((left, right) => left - right).slice(-4);
    return majors.slice(1).map((toMajor, index) => {
      const fromMajor = majors[index];
      const fromVersion = versions.find(({ version }) => major(version) === fromMajor)?.version;
      const toVersion = versions.find(({ version }) => major(version) === toMajor)?.version;
      if (!fromVersion || !toVersion) return null;
      return {
        slug: item.slug,
        label: item.label,
        transition: `${fromMajor}-to-${toMajor}`,
        fromMajor,
        toMajor,
        fromVersion,
        toVersion,
      } satisfies MigrationDefinition;
    }).filter((value): value is MigrationDefinition => Boolean(value));
  });
}
