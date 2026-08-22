import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { major, prerelease, rcompare, valid } from "semver";

const outputPath = resolve("data/packages/catalog.json");
const archivePath = resolve("data/archive/catalog.json");
const digestPath = resolve("data/digest.json");
const supported = [
  { slug: "react", label: "React", primaryPackage: "react", packages: ["react", "react-dom"], sourceNames: ["React Releases", "React Blog"], repositoryUrl: "https://github.com/facebook/react" },
  { slug: "next", label: "Next.js", primaryPackage: "next", packages: ["next"], sourceNames: ["Next.js Releases", "Next.js Security"], repositoryUrl: "https://github.com/vercel/next.js" },
  { slug: "typescript", label: "TypeScript", primaryPackage: "typescript", packages: ["typescript", "@typescript/native-preview"], sourceNames: ["TypeScript Blog", "typescript-go Releases"], repositoryUrl: "https://github.com/microsoft/TypeScript" },
  { slug: "vite", label: "Vite", primaryPackage: "vite", packages: ["vite"], sourceNames: ["Vite Releases"], repositoryUrl: "https://github.com/vitejs/vite" },
  { slug: "react-router", label: "React Router", primaryPackage: "react-router", packages: ["react-router", "react-router-dom"], sourceNames: ["React Router Releases"], repositoryUrl: "https://github.com/remix-run/react-router" },
  { slug: "redux-toolkit", label: "Redux Toolkit", primaryPackage: "@reduxjs/toolkit", packages: ["@reduxjs/toolkit"], sourceNames: ["Redux Toolkit Releases"], repositoryUrl: "https://github.com/reduxjs/redux-toolkit" },
  { slug: "tanstack-query", label: "TanStack Query", primaryPackage: "@tanstack/react-query", packages: ["@tanstack/react-query"], sourceNames: ["TanStack Query Releases"], repositoryUrl: "https://github.com/TanStack/query" },
  { slug: "storybook", label: "Storybook", primaryPackage: "storybook", packages: ["storybook", "@storybook/react"], sourceNames: ["Storybook Releases"], repositoryUrl: "https://github.com/storybookjs/storybook" },
  { slug: "eslint", label: "ESLint", primaryPackage: "eslint", packages: ["eslint"], sourceNames: ["ESLint Releases"], repositoryUrl: "https://github.com/eslint/eslint" },
  { slug: "prettier", label: "Prettier", primaryPackage: "prettier", packages: ["prettier"], sourceNames: ["Prettier Releases"], repositoryUrl: "https://github.com/prettier/prettier" },
];
const packageNames = [...new Set(supported.flatMap(({ packages }) => packages))];
const packageNameSet = new Set(packageNames);

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchJson(url, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json, application/json",
      "user-agent": "frontend-radar/2.0",
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function cleanText(value, limit = 360) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function compatibilitySignature(entry) {
  const peerDependencies = Object.fromEntries(Object.entries(entry.peerDependencies ?? {})
    .filter(([name, range]) => packageNameSet.has(name) && typeof range === "string")
    .sort(([left], [right]) => left.localeCompare(right)));
  const optionalPeers = Object.entries(entry.peerDependenciesMeta ?? {})
    .filter(([name, meta]) => packageNameSet.has(name) && meta?.optional === true)
    .map(([name]) => name)
    .sort();
  return {
    peerDependencies,
    optionalPeers,
    nodeRange: typeof entry.engines?.node === "string" ? entry.engines.node : null,
    deprecated: typeof entry.deprecated === "string" ? cleanText(entry.deprecated, 220) : null,
  };
}

function compressCompatibility(versions, packument) {
  const ascending = [...versions].sort((left, right) => -rcompare(left, right));
  const groups = [];
  for (const version of ascending) {
    const signature = compatibilitySignature(packument.versions?.[version] ?? {});
    const key = JSON.stringify(signature);
    const current = groups.at(-1);
    if (current?.key === key) current.maxVersion = version;
    else groups.push({ key, minVersion: version, maxVersion: version, ...signature });
  }
  return groups.map(({ minVersion, maxVersion, peerDependencies, optionalPeers, nodeRange, deprecated }) => ({
    range: minVersion === maxVersion ? minVersion : `>=${minVersion} <=${maxVersion}`,
    minVersion,
    maxVersion,
    peerDependencies,
    optionalPeers,
    nodeRange,
    deprecated,
  }));
}

function normalizePackument(name, packument) {
  const stableVersions = Object.keys(packument.versions ?? {}).filter((version) => valid(version) && prerelease(version) === null);
  stableVersions.sort(rcompare);
  const latestVersion = valid(packument["dist-tags"]?.latest) ? packument["dist-tags"].latest : stableVersions[0] ?? null;
  const majors = [...new Set(stableVersions.map((version) => major(version)))].sort((left, right) => right - left).slice(0, 4);
  const retained = stableVersions.filter((version) => majors.includes(major(version))).slice(0, 480);
  return {
    name,
    latestVersion,
    latestPublishedAt: latestVersion ? packument.time?.[latestVersion] ?? null : null,
    npmUrl: `https://www.npmjs.com/package/${name}`,
    compatibility: compressCompatibility(retained, packument),
    versions: retained.map((version) => ({ version, publishedAt: packument.time?.[version] ?? null })),
  };
}

async function collectPackages(previous) {
  const oldByName = new Map(previous.packages?.flatMap((group) => group.packages ?? []).map((entry) => [entry.name, entry]) ?? []);
  const collected = new Map();
  const failures = [];
  for (let offset = 0; offset < packageNames.length; offset += 4) {
    const batch = packageNames.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map(async (name) => normalizePackument(name, await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`))));
    results.forEach((result, index) => {
      const name = batch[index];
      if (result.status === "fulfilled") collected.set(name, result.value);
      else {
        failures.push(`npm:${name}`);
        const fallback = oldByName.get(name);
        if (fallback) collected.set(name, fallback);
      }
    });
  }
  return { collected, failures };
}

function advisoryFallback(item) {
  const vulnerabilities = (item.vulnerabilities ?? []).filter(({ package: entry }) => entry?.ecosystem === "npm" && packageNameSet.has(entry.name)).map((entry) => ({
    packageName: entry.package.name,
    vulnerableRange: entry.vulnerable_version_range,
    fixedVersion: entry.first_patched_version?.identifier ?? null,
  }));
  const packageList = [...new Set(vulnerabilities.map(({ packageName }) => packageName))].join(", ");
  return {
    ghsaId: item.ghsa_id,
    cveId: item.cve_id ?? null,
    severity: ["critical", "high", "medium", "low"].includes(item.severity) ? item.severity : "unknown",
    cvss: typeof item.cvss?.score === "number" ? item.cvss.score : null,
    title: `Уязвимость ${item.ghsa_id} в ${packageList}`,
    summary: `Проверьте установленную версию ${packageList} и обновитесь до исправленного релиза, если она входит в затронутый диапазон.`,
    publishedAt: item.published_at,
    updatedAt: item.updated_at,
    url: item.html_url,
    vulnerabilities,
    _sourceTitle: cleanText(item.summary, 180),
    _sourceSummary: cleanText(item.description, 600),
  };
}

function parseGroqJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function translateAdvisories(advisories, previous) {
  const oldById = new Map(previous.packages?.flatMap(({ advisories: items }) => items ?? []).map((item) => [item.ghsaId, item]) ?? []);
  const fresh = advisories.filter(({ ghsaId, _sourceTitle }) => {
    const old = oldById.get(ghsaId);
    return Boolean(_sourceTitle) && (!old || old.title.startsWith(`Уязвимость ${ghsaId}`));
  });
  const groqKey = process.env.GROQ_API_KEY ?? process.env.GROQ;
  const translations = new Map();
  if (groqKey && fresh.length) {
    for (let offset = 0; offset < fresh.length; offset += 20) {
      const batch = fresh.slice(offset, offset + 20);
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${groqKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            temperature: 0.1,
            messages: [{ role: "user", content: `Переведи на русский advisory и сформулируй практический конспект. Верни только JSON-массив объектов {ghsaId,title,summary}; title до 100 символов, summary до 240 символов. Не придумывай факты.\n${JSON.stringify(batch.map(({ ghsaId, _sourceTitle, _sourceSummary }) => ({ ghsaId, title: _sourceTitle, summary: _sourceSummary })))}` }],
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error(`${response.status}`);
        const body = await response.json();
        for (const item of parseGroqJson(body.choices?.[0]?.message?.content)) translations.set(item.ghsaId, item);
      } catch (error) {
        console.warn(`Advisory translation fallback: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  return advisories.map((raw) => {
    const item = { ...raw };
    delete item._sourceTitle;
    delete item._sourceSummary;
    const old = oldById.get(item.ghsaId);
    const translated = translations.get(item.ghsaId);
    return {
      ...item,
      title: cleanText(translated?.title ?? old?.title ?? item.title, 120),
      summary: cleanText(translated?.summary ?? old?.summary ?? item.summary, 280),
    };
  });
}

async function collectAdvisories(previous) {
  const headers = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const oldAdvisories = previous.packages?.flatMap(({ advisories: items }) => items ?? []) ?? [];
  const collected = [];
  const failures = [];
  for (let offset = 0; offset < packageNames.length; offset += 4) {
    const batch = packageNames.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map(async (packageName) => {
      const packageItems = [];
      for (let page = 1; page <= 4; page += 1) {
        const url = new URL("https://api.github.com/advisories");
        url.searchParams.set("ecosystem", "npm");
        url.searchParams.set("affects", packageName);
        url.searchParams.set("is_withdrawn", "false");
        url.searchParams.set("per_page", "100");
        url.searchParams.set("page", String(page));
        const items = await fetchJson(url, headers);
        packageItems.push(...items);
        if (items.length < 100) break;
      }
      return packageItems.map(advisoryFallback).filter(({ vulnerabilities }) => vulnerabilities.some((item) => item.packageName === packageName));
    }));
    results.forEach((result, index) => {
      const packageName = batch[index];
      if (result.status === "fulfilled") collected.push(...result.value);
      else {
        failures.push(`github-advisories:${packageName}`);
        collected.push(...oldAdvisories.filter(({ vulnerabilities }) => vulnerabilities.some((item) => item.packageName === packageName)));
      }
    });
  }
  const unique = [...new Map(collected.map((item) => [item.ghsaId, item])).values()];
  return { advisories: await translateAdvisories(unique, previous), failures };
}

function eventKind(item) {
  if (item.changeType === "security" || item.priority === "P0") return "security";
  if (item.changeType === "major" || item.changeType === "breaking") return "major";
  if (item.changeType === "minor") return "minor";
  return "patch";
}

function eventVersion(item) {
  const explicit = item.packages?.map(({ releasedVersion, fixedVersion }) => releasedVersion ?? fixedVersion).find(Boolean);
  if (explicit && valid(String(explicit).replace(/^v/, ""))) return String(explicit).replace(/^v/, "");
  const match = item.title.match(/(?:^|\s)v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)(?:\b|$)/);
  return match?.[1] ?? null;
}

function collectEvents(group, archive, digest) {
  const issues = [digest, ...(archive.issues ?? [])];
  const seen = new Set();
  return issues.flatMap((issue) => [...(issue.items ?? []), ...(issue.readLater ?? [])].flatMap((item) => {
    const explicitPackage = item.packages?.some(({ name }) => group.packages.includes(name.toLowerCase()));
    if (!explicitPackage && !group.sourceNames.includes(item.source)) return [];
    if (seen.has(item.url)) return [];
    seen.add(item.url);
    return [{
      id: createHash("sha256").update(item.url).digest("hex").slice(0, 14),
      kind: eventKind(item),
      priority: item.priority,
      version: eventVersion(item),
      title: item.title,
      summary: item.whyImportant,
      publishedAt: item.publishedAt,
      source: item.source,
      url: item.url,
    }];
  })).sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt)).slice(0, 30);
}

function validateCatalog(catalog) {
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.packages) || catalog.packages.length !== supported.length) throw new Error("Package catalog has an invalid structure.");
  const slugs = new Set();
  for (const group of catalog.packages) {
    if (slugs.has(group.slug)) throw new Error(`Duplicate package slug: ${group.slug}`);
    slugs.add(group.slug);
    if (!group.packageNames.length || !Array.isArray(group.packages) || !Array.isArray(group.advisories)) throw new Error(`Incomplete package group: ${group.slug}`);
  }
}

const previous = await readJson(outputPath, { packages: [] });
const archive = await readJson(archivePath, { issues: [] });
const digest = await readJson(digestPath, { items: [], readLater: [] });
const [{ collected, failures }, advisoryResult] = await Promise.all([collectPackages(previous), collectAdvisories(previous)]);
const packages = supported.map((group) => {
  const tracked = group.packages.map((name) => collected.get(name)).filter(Boolean);
  const primary = tracked.find(({ name }) => name === group.primaryPackage) ?? tracked[0] ?? null;
  const groupAdvisories = advisoryResult.advisories.filter(({ vulnerabilities }) => vulnerabilities.some(({ packageName }) => group.packages.includes(packageName)));
  return {
    slug: group.slug,
    label: group.label,
    primaryPackage: group.primaryPackage,
    packageNames: group.packages,
    latestVersion: primary?.latestVersion ?? null,
    latestPublishedAt: primary?.latestPublishedAt ?? null,
    npmUrl: primary?.npmUrl ?? `https://www.npmjs.com/package/${group.primaryPackage}`,
    repositoryUrl: group.repositoryUrl,
    packages: tracked,
    advisories: groupAdvisories.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    events: collectEvents(group, archive, digest),
  };
});
const failed = [...failures, ...advisoryResult.failures];
const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceHealth: {
    attempted: packageNames.length * 2,
    succeeded: packageNames.length * 2 - failed.length,
    failed,
    stale: failed.length > 0,
  },
  packages,
};
validateCatalog(catalog);
await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
console.log(`Generated package catalog with ${packages.length} groups and ${failed.length} failed sources.`);
