import assert from "node:assert/strict";
import test from "node:test";
import { appendScanSnapshot, buildCompatibilityReport, createScanSnapshot, readScanHistory, reportMarkdown, scanChanges, scanSnapshotCounts } from "../lib/compatibility";
import { parseLockfile } from "../lib/lockfiles";
import type { PackageCatalogV1, PackageIntelligence, TrackedPackage } from "../lib/package-catalog";
import { parseProjectManifest, readProjectProfile, type ProjectProfile } from "../lib/project";
import { buildVersionComparison, comparisonPullRequestMarkdown, migrationDefinitions } from "../lib/version-comparison";

function tracked(name: string, versions: string[], peerDependencies: Record<string, string> = {}, nodeRange: string | null = ">=20.0.0"): TrackedPackage {
  return {
    name,
    latestVersion: versions.at(-1) ?? null,
    latestPublishedAt: "2026-08-22T05:00:00.000Z",
    npmUrl: `https://www.npmjs.com/package/${name}`,
    compatibility: [{
      range: `>=${versions[0]} <=${versions.at(-1)}`,
      minVersion: versions[0],
      maxVersion: versions.at(-1)!,
      peerDependencies,
      optionalPeers: [],
      nodeRange,
      deprecated: null,
    }],
    versions: versions.map((version) => ({ version, publishedAt: "2026-08-22T05:00:00.000Z" })),
  };
}

function group(slug: string, label: string, primaryPackage: string, packages: TrackedPackage[]): PackageIntelligence {
  return {
    slug,
    label,
    primaryPackage,
    packageNames: packages.map(({ name }) => name),
    latestVersion: packages[0]?.latestVersion ?? null,
    latestPublishedAt: packages[0]?.latestPublishedAt ?? null,
    npmUrl: packages[0]?.npmUrl ?? "https://www.npmjs.com",
    repositoryUrl: `https://github.com/example/${slug}`,
    packages,
    advisories: [],
    events: [],
  };
}

function catalog(groups: PackageIntelligence[]): PackageCatalogV1 {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-22T05:00:00.000Z",
    sourceHealth: { attempted: 4, succeeded: 4, failed: [], stale: false },
    packages: groups,
  };
}

function profile(packages: ProjectProfile["packages"], changes: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    version: 2,
    name: "radar-app",
    packages,
    technologies: ["react", "nextjs"],
    packageManager: "pnpm",
    nodeVersion: "22.18.0",
    updatedAt: "2026-08-22T05:00:00.000Z",
    ...changes,
  };
}

const exactPackages = [
  { name: "next", version: "15.4.1", declaredVersion: "^15.4.0", resolvedVersion: "15.4.1", resolution: "lockfile" as const, sections: ["dependencies"] },
  { name: "react", version: "19.1.0", declaredVersion: "^19.0.0", resolvedVersion: "19.1.0", resolution: "lockfile" as const, sections: ["dependencies"] },
];

test("lock readers resolve npm, pnpm, Yarn Classic/Berry and text Bun versions", async () => {
  const manifest = parseProjectManifest(JSON.stringify({ dependencies: { react: "^19.0.0", next: "^16.0.0" } })).profile.packages;
  const samples: Record<string, string> = {
    "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/react": { version: "19.2.6" }, "node_modules/next": { version: "16.3.2" } } }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      react:\n        specifier: ^19.0.0\n        version: 19.2.6\n      next:\n        specifier: ^16.0.0\n        version: 16.3.2\n",
    "yarn-classic.lock": "react@^19.0.0:\n  version \"19.2.6\"\n\nnext@^16.0.0:\n  version \"16.3.2\"\n",
    "yarn-berry.lock": "__metadata:\n  version: 8\n\n\"react@npm:^19.0.0\":\n  version: 19.2.6\n  resolution: \"react@npm:19.2.6\"\n\n\"next@npm:^16.0.0\":\n  version: 16.3.2\n  resolution: \"next@npm:16.3.2\"\n",
    "bun.lock": "{\n  \"lockfileVersion\": 1,\n  \"packages\": {\n    \"react@19.2.6\": [\"react@19.2.6\"],\n    \"next@16.3.2\": [\"next@16.3.2\"]\n  }\n}",
  };
  for (const [fixtureName, contents] of Object.entries(samples)) {
    const fileName = fixtureName.startsWith("yarn-") ? "yarn.lock" : fixtureName;
    const result = await parseLockfile(fileName, contents, manifest);
    assert.deepEqual(result.versions, { next: "16.3.2", react: "19.2.6" }, fixtureName);
  }
  await assert.rejects(parseLockfile("bun.lockb", "binary", manifest), /save-text-lockfile/);
  await assert.rejects(parseLockfile("package-lock.json", "{broken", manifest), /JSON/);
  await assert.rejects(parseLockfile("pnpm-lock.yaml", "importers:\n  apps/a: {}\n  apps/b: {}\n", manifest), /workspace/);
});

test("legacy project state migrates to v2 without retaining source files", () => {
  const migrated = readProjectProfile(JSON.stringify({ version: 1, name: "legacy", packages: [{ name: "react", version: "^18.0.0", sections: ["dependencies"] }], technologies: ["react"], updatedAt: "2025-01-01T00:00:00.000Z" }));
  assert.equal(migrated?.version, 2);
  assert.equal(migrated?.packages[0].declaredVersion, "^18.0.0");
  assert.equal(migrated?.packages[0].resolution, "manifest");
});

test("compatibility report chooses the latest compatible patch and prioritizes security", () => {
  const next = group("next", "Next.js", "next", [tracked("next", ["15.4.1", "15.4.2", "15.4.3"], { react: "^18.2.0 || ^19.0.0" })]);
  next.advisories.push({
    ghsaId: "GHSA-test-next",
    cveId: null,
    severity: "high",
    cvss: 8,
    title: "Тестовый advisory",
    summary: "Нужно обновление.",
    publishedAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    url: "https://github.com/advisories/GHSA-test-next",
    vulnerabilities: [{ packageName: "next", vulnerableRange: "<15.4.2", fixedVersion: "15.4.2" }],
  });
  const report = buildCompatibilityReport(profile(exactPackages), catalog([next, group("react", "React", "react", [tracked("react", ["19.1.0"])])]));
  const signal = report.signals.find(({ package: item }) => item.name === "next");
  assert.equal(signal?.status, "update");
  assert.equal(signal?.targetVersion, "15.4.3");
  assert.equal(signal?.changeKind, "security");
  assert.equal(report.commands[0], "pnpm add next@15.4.3");
  assert.match(reportMarkdown(profile(exactPackages), report), /pnpm add next@15\.4\.3/);
});

test("major-only security fix is an explicit migration and peer conflicts stop commands", () => {
  const next = group("next", "Next.js", "next", [tracked("next", ["15.4.1", "16.0.0"], { react: "^19.0.0" })]);
  next.advisories.push({
    ghsaId: "GHSA-major-fix", cveId: null, severity: "critical", cvss: 9.8, title: "Major fix", summary: "Major required", publishedAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z", url: "https://github.com/advisories/GHSA-major-fix",
    vulnerabilities: [{ packageName: "next", vulnerableRange: "<16.0.0", fixedVersion: "16.0.0" }],
  });
  const migration = buildCompatibilityReport(profile(exactPackages), catalog([next, group("react", "React", "react", [tracked("react", ["19.1.0"])])]));
  assert.equal(migration.signals.find(({ package: item }) => item.name === "next")?.status, "prerequisite");
  assert.equal(migration.signals.find(({ package: item }) => item.name === "next")?.targetVersion, "16.0.0");

  const conflictNext = group("next", "Next.js", "next", [tracked("next", ["15.4.1"], { react: "^20.0.0" })]);
  const conflict = buildCompatibilityReport(profile(exactPackages), catalog([conflictNext, group("react", "React", "react", [tracked("react", ["19.1.0"])])]));
  assert.equal(conflict.blocked, true);
  assert.deepEqual(conflict.commands, []);
  assert.match(conflict.steps[0].title, /несовместимые требования/i);
});

test("missing Node data and non-registry protocols are reported as insufficient data", () => {
  const reactCatalog = catalog([group("react", "React", "react", [tracked("react", ["19.1.0"])])]);
  const withoutNode = buildCompatibilityReport(profile([exactPackages[1]], { nodeVersion: undefined, nodeRange: undefined }), reactCatalog);
  assert.equal(withoutNode.signals[0].status, "unknown");
  const fileProtocol = buildCompatibilityReport(profile([{ name: "react", version: "file:../react", declaredVersion: "file:../react", resolution: "manifest", sections: ["dependencies"] }]), reactCatalog);
  assert.equal(fileProtocol.signals[0].status, "unknown");
});

test("scan history reports version and recommendation changes", () => {
  const reactCatalog = catalog([group("react", "React", "react", [tracked("react", ["19.1.0", "19.2.0"], {}, null)])]);
  const first = createScanSnapshot(buildCompatibilityReport(profile([exactPackages[1]]), reactCatalog), reactCatalog.generatedAt, "2026-08-21T00:00:00.000Z");
  const second = createScanSnapshot(buildCompatibilityReport(profile([{ ...exactPackages[1], version: "19.2.0", resolvedVersion: "19.2.0" }]), reactCatalog), reactCatalog.generatedAt, "2026-08-22T00:00:00.000Z");
  assert.match(scanChanges(first, second)[0], /19\.1\.0.*19\.2\.0/);
  const history = appendScanSnapshot([first], second);
  assert.equal(history.length, 2);
  assert.deepEqual(readScanHistory(JSON.stringify({ version: 2, snapshots: history })), history);
  assert.deepEqual(readScanHistory(JSON.stringify(first)), [first]);
  assert.equal(scanSnapshotCounts(second).compatible, 1);
  assert.equal(appendScanSnapshot(history, second), history);
});

test("version comparison builds a major migration and a ready-to-use PR body", () => {
  const next = group("next", "Next.js", "next", [tracked("next", ["15.4.1", "15.4.2", "16.0.0"], { react: "^19.0.0" })]);
  next.events.push({ id: "next-16", kind: "major", priority: "P1", version: "16.0.0", title: "Next.js 16", summary: "Новая major-линия.", publishedAt: "2026-08-22T05:00:00.000Z", source: "Next.js Releases", url: "https://github.com/vercel/next.js/releases/tag/v16.0.0" });
  next.advisories.push({
    ghsaId: "GHSA-version-diff", cveId: null, severity: "high", cvss: 8.1, title: "Тестовый advisory", summary: "Исправляется обновлением.", publishedAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z", url: "https://github.com/advisories/GHSA-version-diff",
    vulnerabilities: [{ packageName: "next", vulnerableRange: "<15.4.2", fixedVersion: "15.4.2" }],
  });
  const packageCatalog = catalog([next]);
  const comparison = buildVersionComparison(packageCatalog, "next", "15.4.1", "16.0.0");
  assert.ok(comparison);
  assert.equal(comparison.changeKind, "major");
  assert.deepEqual(comparison.releases.map(({ version }) => version), ["15.4.2", "16.0.0"]);
  assert.equal(comparison.advisories[0].state, "resolved");
  assert.match(comparisonPullRequestMarkdown(comparison, "pnpm"), /pnpm add next@16\.0\.0/);
  assert.match(comparisonPullRequestMarkdown(comparison, "pnpm"), /GHSA-version-diff/);
  assert.deepEqual(migrationDefinitions(packageCatalog).map(({ transition }) => transition), ["15-to-16"]);
  assert.equal(buildVersionComparison(packageCatalog, "next", "16.0.0", "15.4.1"), null);
});
