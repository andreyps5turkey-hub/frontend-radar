import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";

const outputPath = resolve("data/candidates.json");
const now = new Date();
const recentCutoff = now.getTime() - 26 * 60 * 60 * 1000;
const readLaterCutoff = now.getTime() - 45 * 24 * 60 * 60 * 1000;

const sources = JSON.parse(await readFile(new URL("../data/sources.json", import.meta.url), "utf8"));
const sourceNames = new Set(sources.map(({ name }) => name));
const sourceEndpoints = new Set(sources.map(({ url, api }) => url ?? api));
const validGroups = new Set(["P0", "P1", "P2", "P3"]);
const invalidSource = sources.some((source) => !source.name
  || !source.kind
  || !validGroups.has(source.group)
  || Boolean(source.url) === Boolean(source.api)
  || !Array.isArray(source.packages)
  || source.packages.some((name) => typeof name !== "string" || !name));
if (sourceNames.size !== sources.length || sourceEndpoints.size !== sources.length || invalidSource) {
  throw new Error("data/sources.json contains duplicate or incomplete source definitions.");
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  processEntities: true,
  trimValues: true,
});

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") return textValue(value["#text"] ?? value.__cdata ?? value.content);
  return "";
}

function cleanText(value) {
  return textValue(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function atomLink(link) {
  const links = asArray(link);
  const preferred = links.find((item) => item?.["@rel"] === "alternate") ?? links[0];
  return typeof preferred === "string" ? preferred : preferred?.["@href"] ?? "";
}

function scoreItem(item, source) {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  let score = source.weight;
  if (/(security|vulnerab|cve-|remote code|denial of service|xss|csrf|advisory)/i.test(haystack)) score += 120;
  if (/(breaking|major|migration|deprecated|removal|release candidate|\brc\b)/i.test(haystack)) score += 55;
  if (/(release|stable|announc|version|compiler)/i.test(haystack)) score += 25;
  if (/(alpha|beta|canary|nightly)/i.test(haystack)) score -= 20;
  return score;
}

function normalizeFeed(xml, source) {
  const parsed = parser.parse(xml);
  const rssItems = asArray(parsed?.rss?.channel?.item).map((item) => ({
    title: cleanText(item.title),
    url: textValue(item.link) || textValue(item.guid),
    publishedAt: textValue(item.pubDate ?? item.date ?? item["dc:date"]),
    summary: cleanText(item.description ?? item["content:encoded"]),
  }));
  const atomItems = asArray(parsed?.feed?.entry).map((entry) => ({
    title: cleanText(entry.title),
    url: atomLink(entry.link),
    publishedAt: textValue(entry.published ?? entry.updated),
    summary: cleanText(entry.summary ?? entry.content),
  }));

  return [...rssItems, ...atomItems]
    .filter((item) => item.title && item.url && !Number.isNaN(Date.parse(item.publishedAt)))
    .map((item) => ({
      ...item,
      id: createHash("sha256").update(`${source.name}:${item.url}`).digest("hex").slice(0, 16),
      source: source.name,
      sourceKind: source.kind,
      sourcePackages: source.packages ?? [],
      score: scoreItem(item, source),
    }));
}

async function fetchWithTimeout(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/atom+xml, application/rss+xml, application/xml, application/json, text/xml;q=0.9, */*;q=0.5",
      "user-agent": "frontend-radar/1.0 (+https://github.com/andreyps5turkey-hub/frontend-radar)",
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response;
}

async function fetchSecurityAdvisories(source) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetchWithTimeout(source.api, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const advisories = await response.json();
  return asArray(advisories).map((item) => {
    const normalized = {
      title: cleanText(item.summary ?? item.ghsa_id),
      url: item.html_url,
      publishedAt: item.published_at ?? item.updated_at,
      summary: cleanText(item.description),
    };
    return {
      ...normalized,
      id: createHash("sha256").update(`${source.name}:${normalized.url}`).digest("hex").slice(0, 16),
      source: source.name,
      sourceKind: source.kind,
      sourcePackages: source.packages ?? [],
      score: scoreItem(normalized, source),
    };
  });
}

const results = await Promise.allSettled(
  sources.map(async (source) => {
    if (source.api) return fetchSecurityAdvisories(source);
    const response = await fetchWithTimeout(source.url);
    return normalizeFeed(await response.text(), source);
  }),
);

const failures = [];
const allItems = [];
results.forEach((result, index) => {
  if (result.status === "fulfilled") allItems.push(...result.value);
  else failures.push({ source: sources[index].name, error: String(result.reason?.message ?? result.reason) });
});

const uniqueItems = [...new Map(allItems.map((item) => [item.url, item])).values()]
  .filter((item) => Date.parse(item.publishedAt) >= readLaterCutoff)
  .sort((a, b) => {
    const recentDiff = Number(Date.parse(b.publishedAt) >= recentCutoff) - Number(Date.parse(a.publishedAt) >= recentCutoff);
    return recentDiff || b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  })
  .slice(0, 60)
  .map((item) => ({ ...item, inDailyWindow: Date.parse(item.publishedAt) >= recentCutoff }));

const output = {
  generatedAt: now.toISOString(),
  timezone: "Europe/Moscow",
  windowHours: 26,
  sourcesAttempted: sources.length,
  sourcesSucceeded: sources.length - failures.length,
  failures,
  items: uniqueItems,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Collected ${uniqueItems.length} candidates from ${output.sourcesSucceeded}/${output.sourcesAttempted} sources.`);
