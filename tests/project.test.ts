import assert from "node:assert/strict";
import test from "node:test";
import type { ArchiveCatalog, Digest, DigestItem } from "../lib/digest";
import {
  buildUpgradeCommand,
  buildVersionRadar,
  isRecommendedAction,
  parseProjectManifest,
  readActionMap,
  readProjectProfile,
  relevanceForItem,
  type ProjectProfile,
} from "../lib/project";
import { buildWeeklyComparison } from "../lib/weekly";

const enrichedItem: DigestItem = {
  priority: "P0",
  title: "Исправление безопасности Next.js",
  source: "Next.js Advisories",
  publishedAt: "2026-08-14T06:00:00.000Z",
  whyImportant: "Уязвимость затрагивает приложения на Next.js.",
  audience: "Команды с Next.js.",
  nextStep: "Обновить Next.js.",
  url: "https://example.com/advisory",
  tags: ["Next.js", "безопасность"],
  changeType: "security",
  technologies: ["nextjs"],
  packages: [{ name: "next", releasedVersion: null, affectedRange: ">=15.0.0 <15.4.2", fixedVersion: "15.4.2" }],
  risk: "critical",
  effort: "hours",
  actionItems: ["Сверить версию Next.js.", "Установить исправление."],
  detailsConfidence: "source",
};

function project(version: string): ProjectProfile {
  return {
    version: 1,
    name: "radar-app",
    packages: [{ name: "next", version, sections: ["dependencies"] }],
    technologies: ["nextjs", "react"],
    updatedAt: "2026-08-14T08:00:00.000Z",
  };
}

test("package.json import recognizes supported dependencies without retaining the file", () => {
  const result = parseProjectManifest(JSON.stringify({
    name: "radar-app",
    dependencies: { next: "15.4.1", react: "^19.1.0", zod: "^4.0.0" },
    devDependencies: { typescript: "~5.9.0", eslint: "^9.0.0" },
    peerDependencies: { next: ">=15.0.0" },
  }), "2026-08-14T08:00:00.000Z");

  assert.equal(result.profile.name, "radar-app");
  assert.equal(result.profile.packageManager, undefined);
  assert.deepEqual(result.profile.packages.map(({ name }) => name), ["eslint", "next", "react", "typescript"]);
  assert.ok(result.profile.technologies.includes("nextjs"));
  assert.ok(result.profile.technologies.includes("quality"));
  assert.equal(result.ignored, 1);
  assert.equal("dependencies" in result.profile, false);
});

test("package.json import recognizes the declared package manager", () => {
  const result = parseProjectManifest(JSON.stringify({
    name: "radar-app",
    packageManager: "yarn@4.9.2",
    dependencies: { next: "^15.4.0" },
  }));
  assert.equal(result.profile.packageManager, "yarn");
});

test("package.json import reports invalid JSON and local state readers reject corruption", () => {
  assert.throws(() => parseProjectManifest("{bad"), /корректный package\.json/);
  assert.equal(readProjectProfile("{}"), null);
  assert.deepEqual(readActionMap("not-json"), {});
});

test("project relevance distinguishes exact versions, ranges and topic-only matches", () => {
  assert.equal(relevanceForItem(enrichedItem, project("15.4.1")).level, "exact");
  assert.equal(relevanceForItem(enrichedItem, project("^15.4.0")).level, "possible");
  assert.equal(relevanceForItem({ ...enrichedItem, packages: [] }, project("15.4.1")).level, "related");
  assert.equal(relevanceForItem(enrichedItem, null).level, "none");
  assert.equal(isRecommendedAction(enrichedItem, "2026-01-01", "2026-08-14", project("15.4.1")), true);
});

function issue(date: string, item: DigestItem): Digest {
  return {
    date,
    generatedAt: `${date}T05:00:00.000Z`,
    timezone: "Europe/Moscow",
    windowHours: 26,
    status: "active",
    summary: "Есть полезные обновления.",
    items: [{ ...item, url: `${item.url}/${date}`, publishedAt: `${date}T05:00:00.000Z` }],
    readLater: [],
    sourcesChecked: 20,
    sourceHealth: { attempted: 21, succeeded: 20, failed: ["Temporary source"] },
  };
}

test("weekly comparison uses the preceding calendar window and requires three baseline issues", () => {
  const reactItem = { ...enrichedItem, priority: "P1" as const, title: "Новый React major-релиз", source: "React Blog", tags: ["React"], technologies: ["react" as const], packages: [] };
  const catalog: ArchiveCatalog = {
    version: 2,
    updatedAt: "2026-08-14T05:00:00.000Z",
    issues: [
      issue("2026-08-14", reactItem),
      issue("2026-08-12", reactItem),
      issue("2026-08-10", reactItem),
      issue("2026-08-07", enrichedItem),
      issue("2026-08-05", enrichedItem),
      issue("2026-08-03", enrichedItem),
    ],
  };
  const comparison = buildWeeklyComparison(catalog);
  assert.equal(comparison.hasBaseline, true);
  assert.equal(comparison.current.issues.length, 3);
  assert.equal(comparison.previous.issues.length, 3);
  assert.ok(comparison.topicChanges.some(({ id, direction }) => id === "react" && direction === "new"));
  assert.ok(comparison.topicChanges.some(({ id, direction }) => id === "nextjs" && direction === "quiet"));
});

test("version radar compares exact package metadata and legacy release titles", () => {
  const nextRelease: DigestItem = {
    ...enrichedItem,
    priority: "P2",
    title: "Next.js 16.3.2 исправляет маршрутизацию",
    source: "Next.js Releases",
    url: "https://example.com/next-16-3-2",
    changeType: undefined,
    packages: undefined,
    risk: undefined,
  };
  const viteRelease: DigestItem = {
    ...enrichedItem,
    priority: "P2",
    title: "Vite 8.2.0",
    source: "Vite Releases",
    url: "https://example.com/vite-8-2-0",
    changeType: "minor",
    technologies: ["vite"],
    packages: [{ name: "vite", releasedVersion: "8.2.0", affectedRange: null, fixedVersion: null }],
    risk: "low",
  };
  const catalog: ArchiveCatalog = {
    version: 2,
    updatedAt: "2026-08-14T05:00:00.000Z",
    issues: [issue("2026-08-14", nextRelease), issue("2026-08-13", viteRelease)],
  };
  const profile: ProjectProfile = {
    version: 1,
    name: "radar-app",
    packages: [
      { name: "next", version: "^15.4.0", sections: ["dependencies"] },
      { name: "vite", version: "8.1.0", sections: ["devDependencies"] },
      { name: "prettier", version: "^3.0.0", sections: ["devDependencies"] },
    ],
    technologies: ["nextjs", "vite", "quality"],
    packageManager: "pnpm",
    updatedAt: "2026-08-14T08:00:00.000Z",
  };

  const signals = buildVersionRadar(catalog, profile);
  const next = signals.find(({ package: entry }) => entry.name === "next");
  const vite = signals.find(({ package: entry }) => entry.name === "vite");
  const prettier = signals.find(({ package: entry }) => entry.name === "prettier");
  assert.equal(next?.status, "major");
  assert.equal(next?.latestVersion, "16.3.2");
  assert.equal(next?.confidence, "inferred");
  assert.equal(vite?.status, "minor");
  assert.equal(vite?.confidence, "source");
  assert.equal(prettier?.status, "unknown");
  assert.equal(buildUpgradeCommand(signals, "pnpm"), "pnpm add next@16.3.2\npnpm add -D vite@8.2.0");
  assert.equal(buildUpgradeCommand(signals, "npm"), "npm install next@16.3.2\nnpm install --save-dev vite@8.2.0");
});
