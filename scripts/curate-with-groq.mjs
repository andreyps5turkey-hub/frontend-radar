import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const MODEL = "openai/gpt-oss-20b";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_INPUT_CANDIDATES = 18;
const MAX_SUMMARY_LENGTH = 520;
const PACKAGE_NAMES = [
  "react", "react-dom", "next", "typescript", "@typescript/native-preview", "vite",
  "react-router", "react-router-dom", "@reduxjs/toolkit", "@tanstack/react-query",
  "storybook", "@storybook/react", "eslint", "prettier",
];
const TECHNOLOGIES = ["react", "nextjs", "typescript", "vite", "router", "redux", "query", "storybook", "quality", "platform"];

const candidatesPath = resolve("data/candidates.json");
const digestPath = resolve("data/digest.json");
const temporaryDigestPath = resolve("data/digest.tmp.json");
const promptPath = resolve(".github/prompts/digest.md");
const archiveDirectory = resolve("data/archive");

const now = new Date();
const issueDate = moscowDate(now);
const [candidateData, instructions, usedUrls, previousDigest] = await Promise.all([
  readJson(candidatesPath),
  readFile(promptPath, "utf8"),
  readArchivedUrls(issueDate),
  readJson(digestPath),
]);

const issue = {
  schemaVersion: 2,
  date: issueDate,
  generatedAt: now.toISOString(),
  timezone: "Europe/Moscow",
  windowHours: candidateData.windowHours,
  sourcesChecked: candidateData.sourcesSucceeded,
  sourceHealth: {
    attempted: candidateData.sourcesAttempted,
    succeeded: candidateData.sourcesSucceeded,
    failed: candidateData.failures.map(({ source }) => source),
  },
};

const unseen = candidateData.items.filter((candidate) => !usedUrls.has(candidate.url));
const dailyCandidates = unseen
  .filter((candidate) => candidate.inDailyWindow)
  .filter(isUsefulDailyCandidate)
  .slice(0, 8);
const readLaterCandidates = unseen
  .filter((candidate) => !candidate.inDailyWindow)
  .filter(isUsefulReadLaterCandidate)
  .slice(0, 12);
const inputCandidates = uniqueByUrl([...dailyCandidates, ...readLaterCandidates])
  .slice(0, MAX_INPUT_CANDIDATES)
  .map(compactCandidate);

let digest;
try {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
  if (inputCandidates.length < 2) throw new Error("Not enough candidates for a complete digest");
  digest = await createGroqDigest(instructions, issue, inputCandidates, dailyCandidates);
  console.log(`Groq created ${digest.items.length} daily items and ${digest.readLater.length} read-later items.`);
} catch (error) {
  console.warn(`Groq curation failed, using deterministic fallback: ${error.message}`);
  digest = createFallbackDigest(issue, dailyCandidates, readLaterCandidates);
}

await writeFile(temporaryDigestPath, `${JSON.stringify(digest, null, 2)}\n`, "utf8");
await rename(temporaryDigestPath, digestPath);

async function createGroqDigest(systemPrompt, trustedIssue, candidates, dailySourceCandidates) {
  let correction = "";
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const modelDigest = await requestDigest(systemPrompt, trustedIssue, candidates, correction);
    try {
      return canonicalizeDigest(modelDigest, trustedIssue, candidates, dailySourceCandidates);
    } catch (error) {
      lastError = error;
      correction = `Previous response failed validation: ${error.message}. Rewrite every title and editorial field in natural Russian. Keep structured details conservative and never invent a package version that is absent from the candidate text.`;
    }
  }
  throw lastError ?? new Error("Groq did not produce a valid Russian digest");
}

async function requestDigest(systemPrompt, trustedIssue, candidates, correction) {
  const response = await fetchWithRetry(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({ issue: trustedIssue, candidates, correction: correction || undefined }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "frontend_radar_digest",
          strict: true,
          schema: digestSchema(),
        },
      },
      reasoning_effort: "low",
      include_reasoning: false,
      temperature: 0.2,
      max_completion_tokens: 3600,
      stream: false,
    }),
  });
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty completion");
  return JSON.parse(content);
}

async function fetchWithRetry(url, options) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) return response;
      const details = (await response.text()).slice(0, 500);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) throw new Error(`Groq HTTP ${response.status}: ${details}`);
      lastError = new Error(`Groq HTTP ${response.status}: ${details}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 30000) : attempt * 4000);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 4000);
    }
  }
  throw lastError ?? new Error("Groq request failed");
}

function canonicalizeDigest(modelDigest, trustedIssue, candidates, dailySourceCandidates) {
  const byUrl = new Map(candidates.map((candidate) => [candidate.url, candidate]));
  const dailyUrls = new Set(dailySourceCandidates.map((candidate) => candidate.url));
  const seen = new Set();

  const canonicalize = (item, group) => {
    const source = byUrl.get(item.url);
    if (!source) throw new Error(`Groq selected an unknown URL for ${group}`);
    if (seen.has(source.url)) throw new Error(`Groq selected a duplicate URL for ${group}`);
    if (group === "items" && !dailyUrls.has(source.url)) {
      throw new Error("Groq placed a non-daily candidate into items");
    }
    seen.add(source.url);
    const fallback = fallbackItem(source, group === "readLater" ? "P3" : item.priority);
    return {
      ...item,
      tags: normalizedList(item.tags, fallback.tags, 4),
      technologies: normalizedList(item.technologies, fallback.technologies, 5),
      packages: verifyPackageVersions(item.packages, source).slice(0, 6),
      actionItems: normalizedList(item.actionItems, fallback.actionItems, 3),
      source: source.source,
      publishedAt: source.publishedAt,
      url: source.url,
    };
  };

  const items = modelDigest.items.slice(0, 8).map((item) => canonicalize(item, "items"));
  const readLater = modelDigest.readLater.slice(0, 3).map((item) => canonicalize(item, "readLater"));
  for (const candidate of candidates) {
    if (readLater.length >= 2) break;
    if (!seen.has(candidate.url)) {
      seen.add(candidate.url);
      readLater.push(fallbackItem(candidate, "P3"));
    }
  }
  for (const previousItem of previousDigest.readLater ?? []) {
    if (readLater.length >= 2) break;
    if (!seen.has(previousItem.url)) {
      seen.add(previousItem.url);
      readLater.push({ ...enrichLegacyItem(previousItem), priority: "P3" });
    }
  }
  if (readLater.length < 2) throw new Error("Not enough unique read-later candidates");

  assertRussianText(modelDigest.summary, "summary");
  for (const [index, item] of [...items, ...readLater].entries()) {
    for (const field of ["title", "whyImportant", "audience", "nextStep"]) {
      assertRussianText(item[field], `entry ${index + 1} ${field}`);
    }
    item.actionItems.forEach((action, actionIndex) => assertRussianText(action, `entry ${index + 1} action ${actionIndex + 1}`));
  }

  return {
    ...trustedIssue,
    status: items.length ? "active" : "quiet",
    summary: modelDigest.summary,
    items,
    readLater,
  };
}

function normalizedList(values, fallbackValues, limit) {
  const normalized = [...new Set(Array.isArray(values) ? values : [])].slice(0, limit);
  return normalized.length ? normalized : fallbackValues.slice(0, limit);
}

function verifyPackageVersions(packages, candidate) {
  const sourceText = `${candidate.title} ${candidate.summary}`.toLowerCase();
  return packages.map((entry) => ({
    ...entry,
    releasedVersion: verifiedVersionField(entry.releasedVersion, sourceText),
    affectedRange: verifiedVersionField(entry.affectedRange, sourceText),
    fixedVersion: verifiedVersionField(entry.fixedVersion, sourceText),
  }));
}

function verifiedVersionField(value, sourceText) {
  if (value === null) return null;
  const versions = String(value).match(/\d+(?:\.\d+){1,3}(?:-[a-z0-9.-]+)?/gi) ?? [];
  if (!versions.length) return null;
  return versions.every((version) => sourceText.includes(version.toLowerCase())) ? value : null;
}

function assertRussianText(value, field) {
  if (typeof value !== "string" || !/[А-Яа-яЁё]/.test(value)) {
    throw new Error(`${field} must contain Russian text`);
  }
}

function createFallbackDigest(trustedIssue, daily, readLater) {
  const items = daily.slice(0, 5).map(fallbackItem);
  const readLaterPool = readLater.length >= 2 ? readLater : candidateData.items.filter(isUsefulReadLaterCandidate);
  const selectedReadLater = uniqueByUrl(readLaterPool)
    .filter((candidate) => !items.some((item) => item.url === candidate.url))
    .slice(0, 3)
    .map((candidate) => fallbackItem(candidate, "P3"));
  for (const previousItem of previousDigest.readLater ?? []) {
    if (selectedReadLater.length >= 3) break;
    if (!selectedReadLater.some((item) => item.url === previousItem.url)) {
      selectedReadLater.push(enrichLegacyItem(previousItem));
    }
  }

  return {
    ...trustedIssue,
    status: items.length ? "active" : "quiet",
    summary: items.length
      ? "Автоматическая подборка собрана в резервном режиме. Проверьте релизы по ссылкам на первоисточники."
      : "Значимых новых событий не найдено. Подборка для чтения собрана в резервном режиме.",
    items,
    readLater: selectedReadLater,
  };
}

function enrichLegacyItem(item) {
  if (item.changeType && item.technologies && item.packages && item.risk && item.effort && item.actionItems && item.detailsConfidence) return item;
  const candidate = {
    title: item.title,
    summary: `${item.whyImportant} ${item.nextStep}`,
    source: item.source,
    sourceKind: item.priority === "P0" ? "security" : "digest",
  };
  const version = item.title.match(/v?\d+(?:\.\d+){1,3}(?:-[\w.]+)?/i)?.[0];
  return {
    ...item,
    changeType: inferChangeType(candidate, item.priority),
    technologies: technologiesFor(candidate),
    packages: packagesFor(candidate, item.priority === "P0" ? undefined : version),
    risk: item.priority === "P0" ? "critical" : item.priority === "P1" ? "high" : item.priority === "P2" ? "medium" : "low",
    effort: item.priority === "P1" ? "days" : item.priority === "P3" ? "minutes" : "hours",
    actionItems: [item.nextStep],
    detailsConfidence: "inferred",
  };
}

function fallbackItem(candidate, forcedPriority) {
  const priority = forcedPriority ?? inferPriority(candidate);
  const version = candidate.title.match(/v?\d+(?:\.\d+){1,3}(?:-[\w.]+)?/i)?.[0];
  const releaseTitle = version
    ? `${candidate.source}: выпуск ${version}`
    : `Новый материал от ${candidate.source}`;
  return {
    priority,
    title: releaseTitle,
    source: candidate.source,
    publishedAt: candidate.publishedAt,
    whyImportant: priority === "P0"
      ? "Источник опубликовал уведомление безопасности, которое требует проверки используемых версий и конфигурации."
      : "Источник опубликовал обновление, которое может затронуть рабочую сборку или инструменты команды.",
    audience: audienceFor(candidate),
    nextStep: priority === "P0"
      ? "Открыть уведомление, сверить затронутые версии и запланировать исправление."
      : "Просмотреть changelog и проверить обновление в отдельной ветке перед внедрением.",
    url: candidate.url,
    tags: tagsFor(candidate),
    changeType: inferChangeType(candidate, priority),
    technologies: technologiesFor(candidate),
    packages: packagesFor(candidate, priority === "P0" ? undefined : version),
    risk: priority === "P0" ? "critical" : priority === "P1" ? "high" : priority === "P2" ? "medium" : "low",
    effort: priority === "P0" ? "hours" : priority === "P1" ? "days" : priority === "P2" ? "hours" : "minutes",
    actionItems: priority === "P0"
      ? ["Сверить используемую версию с уведомлением безопасности.", "Установить исправление или применить рекомендованное ограничение."]
      : ["Проверить список изменений в первоисточнике.", "Протестировать обновление в отдельной ветке."],
    detailsConfidence: "inferred",
  };
}

function compactCandidate(candidate) {
  return {
    title: candidate.title,
    source: candidate.source,
    sourceKind: candidate.sourceKind,
    publishedAt: candidate.publishedAt,
    summary: candidate.summary.slice(0, MAX_SUMMARY_LENGTH),
    url: candidate.url,
    score: candidate.score,
    inDailyWindow: candidate.inDailyWindow,
  };
}

function isUsefulDailyCandidate(candidate) {
  if (isPrerelease(candidate.title)) return false;
  if (isAutomatedNoise(candidate.title)) return false;
  return candidate.sourceKind === "security" || candidate.score >= 75;
}

function isUsefulReadLaterCandidate(candidate) {
  if (isPrerelease(candidate.title) || isAutomatedNoise(candidate.title)) return false;
  if (candidate.sourceKind === "security") {
    return Date.now() - Date.parse(candidate.publishedAt) <= 14 * 24 * 60 * 60 * 1000;
  }
  return candidate.score >= 60;
}

function isPrerelease(title) {
  return /(?:^|[.-])(alpha|beta|canary|nightly|experimental|rc)(?:[.-]|\d|$)/i.test(title);
}

function isAutomatedNoise(title) {
  return /^@[^\s]+@\d|react-router-(?:dom|native).*release|^v0\.0\.0-/i.test(title);
}

function inferPriority(candidate) {
  const text = `${candidate.title} ${candidate.summary}`;
  if (candidate.sourceKind === "security" || /CVE-|vulnerab|security advisory|remote code|denial of service/i.test(text)) return "P0";
  if (/breaking|major stable|migration|required/i.test(text)) return "P1";
  if (candidate.sourceKind === "digest" || candidate.sourceKind === "standards") return "P3";
  return "P2";
}

function inferChangeType(candidate, priority) {
  const text = `${candidate.title} ${candidate.summary}`;
  if (priority === "P0") return "security";
  if (/breaking|migration|required/i.test(text)) return "breaking";
  if (/\bmajor\b/i.test(text)) return "major";
  if (candidate.sourceKind === "standards") return "standard";
  if (candidate.sourceKind === "digest") return "guide";
  if (/release|version|v?\d+\.\d+/i.test(text)) return "minor";
  return "tooling";
}

function technologiesFor(candidate) {
  const text = `${candidate.source} ${candidate.title} ${candidate.summary}`;
  const matches = [];
  const add = (id, pattern) => { if (pattern.test(text)) matches.push(id); };
  add("nextjs", /next\.js|nextjs|turbopack/i);
  add("typescript", /typescript|typescript-go/i);
  add("vite", /\bvite\b/i);
  add("router", /react router|react-router/i);
  add("redux", /redux|@reduxjs\/toolkit/i);
  add("query", /tanstack query|@tanstack\/react-query/i);
  add("storybook", /storybook/i);
  add("quality", /eslint|prettier|lint/i);
  add("platform", /mdn|web\.dev|baseline|tc39|javascript|css/i);
  add("react", /\breact(?:\.js)?\b/i);
  return [...new Set(matches.length ? matches : ["platform"])];
}

function packagesFor(candidate, version) {
  const text = `${candidate.source} ${candidate.title}`;
  const names = [];
  const add = (name, pattern) => { if (pattern.test(text)) names.push(name); };
  add("next", /next\.js|nextjs/i);
  add("typescript", /typescript/i);
  add("vite", /\bvite\b/i);
  add("react-router", /react router|react-router/i);
  add("@reduxjs/toolkit", /redux toolkit|@reduxjs\/toolkit/i);
  add("@tanstack/react-query", /tanstack query|@tanstack\/react-query/i);
  add("storybook", /storybook/i);
  add("eslint", /eslint/i);
  add("prettier", /prettier/i);
  if (/\breact(?:\.js)?\b/i.test(text) && !/react router/i.test(text)) names.push("react");
  return [...new Set(names)].map((name) => ({
    name,
    releasedVersion: version ?? null,
    affectedRange: null,
    fixedVersion: null,
  }));
}

function audienceFor(candidate) {
  if (/Next\.js/i.test(candidate.source)) return "Команды, которые поддерживают приложения на Next.js.";
  if (/React/i.test(candidate.source)) return "Разработчики и команды, использующие React.";
  if (/TypeScript/i.test(candidate.source)) return "Команды с TypeScript-проектами и авторами библиотек.";
  return `Команды, использующие инструменты из экосистемы ${candidate.source}.`;
}

function tagsFor(candidate) {
  const sourceTag = candidate.source.split(/\s+/)[0].toLowerCase().replace(/[^a-zа-я0-9.+-]/gi, "");
  return [sourceTag || "frontend", candidate.sourceKind === "security" ? "безопасность" : "обновление"];
}

function digestSchema() {
  const item = {
    type: "object",
    properties: {
      priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
      title: { type: "string" },
      source: { type: "string" },
      publishedAt: { type: "string" },
      whyImportant: { type: "string" },
      audience: { type: "string" },
      nextStep: { type: "string" },
      url: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      changeType: { type: "string", enum: ["security", "breaking", "major", "minor", "tooling", "guide", "standard"] },
      technologies: { type: "array", items: { type: "string", enum: TECHNOLOGIES } },
      packages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", enum: PACKAGE_NAMES },
            releasedVersion: { type: ["string", "null"] },
            affectedRange: { type: ["string", "null"] },
            fixedVersion: { type: ["string", "null"] },
          },
          required: ["name", "releasedVersion", "affectedRange", "fixedVersion"],
          additionalProperties: false,
        },
      },
      risk: { type: "string", enum: ["critical", "high", "medium", "low", "unknown"] },
      effort: { type: "string", enum: ["minutes", "hours", "days", "unknown"] },
      actionItems: { type: "array", items: { type: "string" } },
      detailsConfidence: { type: "string", enum: ["source", "inferred", "unknown"] },
    },
    required: ["priority", "title", "source", "publishedAt", "whyImportant", "audience", "nextStep", "url", "tags", "changeType", "technologies", "packages", "risk", "effort", "actionItems", "detailsConfidence"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      schemaVersion: { type: "integer", enum: [2] },
      date: { type: "string" },
      generatedAt: { type: "string" },
      timezone: { type: "string" },
      windowHours: { type: "integer" },
      status: { type: "string", enum: ["active", "quiet"] },
      summary: { type: "string" },
      items: { type: "array", items: item },
      readLater: { type: "array", items: item },
      sourcesChecked: { type: "integer" },
      sourceHealth: {
        type: "object",
        properties: {
          attempted: { type: "integer" },
          succeeded: { type: "integer" },
          failed: { type: "array", items: { type: "string" } },
        },
        required: ["attempted", "succeeded", "failed"],
        additionalProperties: false,
      },
    },
    required: ["schemaVersion", "date", "generatedAt", "timezone", "windowHours", "status", "summary", "items", "readLater", "sourcesChecked", "sourceHealth"],
    additionalProperties: false,
  };
}

async function readArchivedUrls(excludeDate) {
  const urls = new Set();
  let files = [];
  try {
    files = await readdir(archiveDirectory);
  } catch {
    return urls;
  }
  await Promise.all(files
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file) && file !== `${excludeDate}.json`)
    .map(async (file) => {
    const digest = await readJson(resolve(archiveDirectory, file));
    for (const item of [...(digest.items ?? []), ...(digest.readLater ?? [])]) {
      if (typeof item.url === "string") urls.add(item.url);
    }
    }));
  return urls;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function uniqueByUrl(items) {
  return [...new Map(items.map((item) => [item.url, item])).values()];
}

function moscowDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
