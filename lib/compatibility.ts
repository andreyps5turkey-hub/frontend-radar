import {
  diff,
  gt,
  intersects,
  major,
  rcompare,
  satisfies,
  valid,
  validRange,
} from "semver";
import type { PackageAdvisory, PackageCatalogV1, PackageIntelligence, TrackedPackage } from "./package-catalog";
import { packageGroupForName, packageIntelligenceForName } from "./package-catalog";
import type { PackageManager, ProjectPackage, ProjectProfile } from "./project";

export type CompatibilityStatus = "compatible" | "update" | "prerequisite" | "conflict" | "unknown";
export type CompatibilityConfidence = "exact" | "range" | "unknown";

export type MatchedAdvisory = {
  advisory: PackageAdvisory;
  confidence: "exact" | "possible";
  fixedVersion: string | null;
};

export type CompatibilitySignal = {
  package: ProjectPackage;
  label: string;
  currentVersion: string | null;
  declaredVersion: string;
  latestVersion: string | null;
  targetVersion: string | null;
  majorAvailable: string | null;
  status: CompatibilityStatus;
  confidence: CompatibilityConfidence;
  reason: string;
  requirements: string[];
  blockers: string[];
  advisories: MatchedAdvisory[];
  deprecated: string | null;
  changeKind: "security" | "major" | "minor" | "patch" | "none";
  sourceUrl: string | null;
};

export type UpgradePlanStep = {
  id: string;
  packageName: string | null;
  title: string;
  detail: string;
  command: string | null;
  kind: "runtime" | "security" | "package" | "manual";
};

export type CompatibilityReport = {
  signals: CompatibilitySignal[];
  steps: UpgradePlanStep[];
  commands: string[];
  checklist: string[];
  blocked: boolean;
  cycle: string[];
};

export type ScanSnapshot = {
  version: 1;
  generatedAt: string;
  catalogGeneratedAt: string;
  packages: Record<string, { currentVersion: string | null; targetVersion: string | null; status: CompatibilityStatus }>;
};

const packageOrder = ["react", "react-dom", "next", "react-router", "react-router-dom", "@reduxjs/toolkit", "@tanstack/react-query", "typescript", "vite", "storybook", "@storybook/react", "eslint", "prettier"];

function cleanRange(value: string) {
  return value.replace(/,\s*/g, " ").trim();
}

function exactVersion(item: ProjectPackage) {
  return valid(item.resolvedVersion ?? item.version)?.toString() ?? null;
}

function declaredRange(item: ProjectPackage) {
  return item.declaredVersion ?? item.version;
}

function rangeMatch(version: string | null, declared: string, expected: string) {
  const normalizedExpected = validRange(cleanRange(expected));
  if (!normalizedExpected) return "unknown" as const;
  if (version) return satisfies(version, normalizedExpected, { includePrerelease: true }) ? "yes" as const : "no" as const;
  if (!declared.trim()) return "unknown" as const;
  const normalizedDeclared = validRange(declared);
  if (!normalizedDeclared) return "unknown" as const;
  return intersects(normalizedDeclared, normalizedExpected, { includePrerelease: true }) ? "possible" as const : "no" as const;
}

function ruleForVersion(tracked: TrackedPackage | null, version: string | null, declared: string) {
  if (!tracked) return null;
  if (version) return tracked.compatibility.find(({ range }) => satisfies(version, range, { includePrerelease: true })) ?? null;
  const declaredSemver = validRange(declared);
  if (!declaredSemver) return null;
  return tracked.compatibility.find(({ range }) => intersects(declaredSemver, range, { includePrerelease: true })) ?? null;
}

function trackedPackage(intelligence: PackageIntelligence | undefined, name: string) {
  return intelligence?.packages.find((item) => item.name === name) ?? null;
}

function matchedAdvisories(item: ProjectPackage, intelligence: PackageIntelligence | undefined): MatchedAdvisory[] {
  const current = exactVersion(item);
  const declared = declaredRange(item);
  return (intelligence?.advisories ?? []).flatMap((advisory) => advisory.vulnerabilities.flatMap((vulnerability) => {
    if (vulnerability.packageName !== item.name) return [];
    const match = rangeMatch(current, declared, vulnerability.vulnerableRange);
    if (match !== "yes" && match !== "possible") return [];
    return [{ advisory, confidence: match === "yes" ? "exact" as const : "possible" as const, fixedVersion: vulnerability.fixedVersion }];
  }));
}

function peerState(project: ProjectProfile, peerName: string, peerRange: string) {
  const peer = project.packages.find(({ name }) => name === peerName);
  if (!peer) return "missing" as const;
  return rangeMatch(exactVersion(peer), declaredRange(peer), peerRange);
}

function requirementsFor(project: ProjectProfile, tracked: TrackedPackage | null, version: string | null, declared: string) {
  const rule = ruleForVersion(tracked, version, declared);
  if (!rule) return { rule: null, requirements: [] as string[], blockers: [] as string[], unknown: true };
  const requirements: string[] = [];
  const blockers: string[] = [];
  let unknown = false;
  for (const [peerName, peerRange] of Object.entries(rule.peerDependencies)) {
    const state = peerState(project, peerName, peerRange);
    requirements.push(`${peerName} ${peerRange}`);
    if (state === "missing" && !rule.optionalPeers.includes(peerName)) blockers.push(`Требуется ${peerName} ${peerRange}`);
    else if (state === "no") blockers.push(`${peerName} проекта не входит в ${peerRange}`);
  }
  if (rule.nodeRange) {
    requirements.push(`Node.js ${rule.nodeRange}`);
    const nodeMatch = rangeMatch(valid(project.nodeVersion ?? ""), project.nodeRange ?? "", rule.nodeRange);
    if (nodeMatch === "no") blockers.push(`Node.js проекта не входит в ${rule.nodeRange}`);
    if (nodeMatch === "unknown") unknown = true;
  }
  return { rule, requirements, blockers, unknown };
}

function compatibleCandidate(project: ProjectProfile, tracked: TrackedPackage, version: string) {
  return requirementsFor(project, tracked, version, version).blockers.length === 0;
}

function conservativeTarget(project: ProjectProfile, tracked: TrackedPackage | null, current: string | null) {
  if (!tracked || !current) return null;
  const candidates = tracked.versions.map(({ version }) => version)
    .filter((version) => major(version) === major(current) && gt(version, current))
    .sort(rcompare);
  return candidates.find((version) => compatibleCandidate(project, tracked, version)) ?? null;
}

function updateKind(current: string | null, target: string | null, security: boolean) {
  if (security) return "security" as const;
  if (!current || !target || !gt(target, current)) return "none" as const;
  const difference = diff(current, target);
  if (difference === "major" || difference === "premajor") return "major" as const;
  if (difference === "minor" || difference === "preminor") return "minor" as const;
  return "patch" as const;
}

function signalForPackage(project: ProjectProfile, item: ProjectPackage, catalog: PackageCatalogV1): CompatibilitySignal {
  const intelligence = packageIntelligenceForName(catalog, item.name);
  const tracked = trackedPackage(intelligence, item.name);
  const current = exactVersion(item);
  const declared = declaredRange(item);
  const currentRequirements = requirementsFor(project, tracked, current, declared);
  const advisories = matchedAdvisories(item, intelligence);
  const exactAdvisory = advisories.find(({ confidence }) => confidence === "exact") ?? advisories[0];
  const securityTarget = exactAdvisory?.fixedVersion && valid(exactAdvisory.fixedVersion) ? exactAdvisory.fixedVersion : null;
  const normalTarget = conservativeTarget(project, tracked, current);
  const target = securityTarget && (!current || gt(securityTarget, current))
    ? current && major(securityTarget) === major(current) && normalTarget && gt(normalTarget, securityTarget) ? normalTarget : securityTarget
    : normalTarget;
  const targetRequirements = target ? requirementsFor(project, tracked, target, target) : currentRequirements;
  const latest = tracked?.latestVersion ?? intelligence?.latestVersion ?? null;
  const majorAvailable = current && latest && major(latest) > major(current) ? latest : null;
  const deprecated = currentRequirements.rule?.deprecated ?? null;
  let status: CompatibilityStatus = "compatible";
  let reason = "Текущая версия совместима с известными требованиями стека.";
  if (!tracked || !currentRequirements.rule || (!current && !validRange(declared))) {
    status = "unknown";
    reason = "Для этой версии недостаточно точных данных совместимости.";
  } else if (currentRequirements.blockers.length) {
    status = "conflict";
    reason = currentRequirements.blockers[0];
  } else if (exactAdvisory && securityTarget && current && major(securityTarget) !== major(current)) {
    status = "prerequisite";
    reason = `Исправление безопасности требует перехода на major ${major(securityTarget)}.`;
  } else if (targetRequirements.blockers.length) {
    status = "prerequisite";
    reason = targetRequirements.blockers[0];
  } else if (currentRequirements.unknown || targetRequirements.unknown) {
    status = "unknown";
    reason = "Не указана фактическая версия Node.js или совместимый диапазон engines.node.";
  } else if (target && (!current || gt(target, current))) {
    status = "update";
    reason = exactAdvisory ? "Доступна версия, закрывающая найденный advisory." : `Доступно совместимое обновление до ${target}.`;
  } else if (advisories.some(({ confidence }) => confidence === "possible")) {
    status = "prerequisite";
    reason = "Диапазон package.json пересекается с advisory; нужен lock-файл для точной проверки.";
  } else if (deprecated) {
    status = "prerequisite";
    reason = "Установленная линия пакета помечена deprecated в npm.";
  }
  return {
    package: item,
    label: packageGroupForName(item.name)?.label ?? item.name,
    currentVersion: current,
    declaredVersion: declared,
    latestVersion: latest,
    targetVersion: target,
    majorAvailable,
    status,
    confidence: current ? "exact" : validRange(declared) ? "range" : "unknown",
    reason,
    requirements: targetRequirements.requirements,
    blockers: [...new Set([...currentRequirements.blockers, ...targetRequirements.blockers])],
    advisories,
    deprecated,
    changeKind: updateKind(current, target, Boolean(exactAdvisory)),
    sourceUrl: intelligence?.repositoryUrl ?? null,
  };
}

function managerCommand(manager: PackageManager, item: ProjectPackage, version: string) {
  const target = `${item.name}@${version}`;
  const development = item.sections.includes("devDependencies");
  if (manager === "npm") return `npm install${development ? " --save-dev" : ""} ${target}`;
  return `${manager} add${development ? " -D" : ""} ${target}`;
}

function testChecklist(signals: CompatibilitySignal[]) {
  const names = new Set(signals.filter(({ targetVersion }) => targetVersion).map(({ package: item }) => item.name));
  const checks = new Set<string>();
  if (names.has("typescript")) checks.add("Запустить typecheck без изменения выходных файлов.");
  if (names.has("eslint")) checks.add("Запустить lint и просмотреть новые или изменившиеся правила.");
  if (["react", "react-dom", "next"].some((name) => names.has(name))) {
    checks.add("Собрать production-версию и проверить отсутствие hydration-ошибок.");
    checks.add("Проверить основные маршруты, SSR и React Server Components, если они используются.");
  }
  if (["react-router", "react-router-dom"].some((name) => names.has(name))) checks.add("Проверить переходы, loaders/actions и прямое открытие вложенных маршрутов.");
  if (["storybook", "@storybook/react"].some((name) => names.has(name))) checks.add("Собрать Storybook и открыть ключевые stories.");
  if (names.has("vite")) checks.add("Проверить dev-сервер и production build, включая динамические импорты.");
  checks.add("Запустить существующие автоматические тесты проекта.");
  return [...checks];
}

function planOrder(name: string) {
  const index = packageOrder.indexOf(name);
  return index < 0 ? packageOrder.length : index;
}

function buildSteps(project: ProjectProfile, signals: CompatibilitySignal[]) {
  const actionable = signals.filter(({ status, targetVersion }) => targetVersion && (status === "update" || status === "prerequisite"));
  const nodes = new Map(actionable.map((signal) => [signal.package.name, signal]));
  const incoming = new Map([...nodes.keys()].map((name) => [name, 0]));
  const edges = new Map([...nodes.keys()].map((name) => [name, new Set<string>()]));
  for (const signal of actionable) {
    const intelligenceName = signal.package.name;
    const requirements = signal.requirements;
    for (const peerName of nodes.keys()) {
      if (peerName !== intelligenceName && requirements.some((entry) => entry.startsWith(`${peerName} `))) {
        if (!edges.get(peerName)?.has(intelligenceName)) {
          edges.get(peerName)?.add(intelligenceName);
          incoming.set(intelligenceName, (incoming.get(intelligenceName) ?? 0) + 1);
        }
      }
    }
  }
  const compareNodes = (left: string, right: string) => Number(nodes.get(right)?.changeKind === "security") - Number(nodes.get(left)?.changeKind === "security") || planOrder(left) - planOrder(right);
  const ready = [...nodes.keys()].filter((name) => incoming.get(name) === 0).sort(compareNodes);
  const ordered: string[] = [];
  while (ready.length) {
    const name = ready.shift();
    if (!name) break;
    ordered.push(name);
    for (const dependent of edges.get(name) ?? []) {
      incoming.set(dependent, (incoming.get(dependent) ?? 1) - 1);
      if (incoming.get(dependent) === 0) ready.push(dependent);
    }
    ready.sort(compareNodes);
  }
  const cycle = [...nodes.keys()].filter((name) => !ordered.includes(name));
  const manager = project.packageManager ?? "pnpm";
  if (cycle.length) {
    return {
      steps: [{ id: "manual:cycle", packageName: null, title: "Разрешить конфликт зависимостей вручную", detail: `Циклические требования: ${cycle.join(", ")}.`, command: null, kind: "manual" } satisfies UpgradePlanStep],
      cycle,
    };
  }
  const runtimeRanges = [...new Set(actionable.flatMap(({ blockers }) => blockers.filter((item) => item.startsWith("Node.js "))))];
  const steps: UpgradePlanStep[] = ordered.map((name) => {
    const signal = nodes.get(name)!;
    return {
      id: `package:${name}`,
      packageName: name,
      title: `Обновить ${name} до ${signal.targetVersion}`,
      detail: signal.reason,
      command: managerCommand(manager, signal.package, signal.targetVersion!),
      kind: signal.changeKind === "security" ? "security" as const : "package" as const,
    };
  });
  if (runtimeRanges.length) steps.unshift({ id: "runtime:node", packageName: null, title: "Обновить среду Node.js", detail: runtimeRanges.join("; "), command: null, kind: "runtime" });
  return { steps, cycle };
}

export function buildCompatibilityReport(project: ProjectProfile | null, catalog: PackageCatalogV1): CompatibilityReport {
  if (!project) return { signals: [], steps: [], commands: [], checklist: [], blocked: false, cycle: [] };
  const signals = project.packages.map((item) => signalForPackage(project, item, catalog)).sort((left, right) => {
    const rank: Record<CompatibilityStatus, number> = { conflict: 0, prerequisite: 1, update: 2, compatible: 3, unknown: 4 };
    return rank[left.status] - rank[right.status] || planOrder(left.package.name) - planOrder(right.package.name);
  });
  const built = buildSteps(project, signals);
  const conflicts = signals.filter(({ status }) => status === "conflict");
  const blocked = built.cycle.length > 0 || conflicts.length > 0;
  const steps = conflicts.length && !built.cycle.length
    ? [{ id: "manual:conflict", packageName: null, title: "Разрешить несовместимые требования", detail: conflicts.map(({ package: item, reason }) => `${item.name}: ${reason}`).join("; "), command: null, kind: "manual" as const }]
    : built.steps;
  const commands = blocked ? [] : steps.flatMap(({ command }) => command ? [command] : []);
  return { signals, steps, commands, checklist: testChecklist(signals), blocked, cycle: built.cycle };
}

export function createScanSnapshot(report: CompatibilityReport, catalogGeneratedAt: string, now = new Date().toISOString()): ScanSnapshot {
  return {
    version: 1,
    generatedAt: now,
    catalogGeneratedAt,
    packages: Object.fromEntries(report.signals.map((signal) => [signal.package.name, {
      currentVersion: signal.currentVersion,
      targetVersion: signal.targetVersion,
      status: signal.status,
    }])),
  };
}

export function scanChanges(previous: ScanSnapshot | null, current: ScanSnapshot) {
  if (!previous) return [];
  return Object.entries(current.packages).flatMap(([name, value]) => {
    const old = previous.packages[name];
    if (!old) return [`${name} добавлен в проверку.`];
    if (old.currentVersion !== value.currentVersion) return [`${name}: установлено ${old.currentVersion ?? "неизвестно"} → ${value.currentVersion ?? "неизвестно"}.`];
    if (old.status !== value.status) return [`${name}: статус изменился с ${old.status} на ${value.status}.`];
    if (old.targetVersion !== value.targetVersion) return [`${name}: новая рекомендуемая версия ${value.targetVersion ?? "не требуется"}.`];
    return [];
  });
}

export function reportMarkdown(project: ProjectProfile, report: CompatibilityReport) {
  const lines = [`# План обновления ${project.name}`, "", `Сформировано Frontend Radar. Проверено прямых пакетов: ${report.signals.length}.`, ""];
  if (report.steps.length) {
    lines.push("## Шаги", "");
    report.steps.forEach((step, index) => {
      lines.push(`${index + 1}. **${step.title}** — ${step.detail}`);
      if (step.command) lines.push(`   \`${step.command}\``);
    });
  } else lines.push("Совместимых обновлений в текущих major-линиях не найдено.", "");
  lines.push("", "## Проверка", "", ...report.checklist.map((item) => `- [ ] ${item}`), "", "> Проверка охватывает только поддерживаемые прямые зависимости и не заменяет npm audit или Dependabot.");
  return lines.join("\n");
}
