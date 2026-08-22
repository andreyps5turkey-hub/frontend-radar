import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const MODEL = "openai/gpt-oss-20b";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_INPUT_CANDIDATES = 18;
const MAX_SUMMARY_LENGTH = 520;

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
  date: issueDate,
  generatedAt: now.toISOString(),
  timezone: "Europe/Moscow",
  windowHours: candidateData.windowHours,
  sourcesChecked: candidateData.sourcesSucceeded,
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
      correction = `Previous response failed the Russian-language quality gate: ${error.message}. Rewrite every title, summary, whyImportant, audience, and nextStep in natural Russian with Cyrillic text. A version number or an English source title alone is not a translated title.`;
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
      max_completion_tokens: 2200,
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
    return {
      ...item,
      source: source.source,
      publishedAt: source.publishedAt,
      url: source.url,
    };
  };

  const items = modelDigest.items.map((item) => canonicalize(item, "items"));
  const readLater = modelDigest.readLater.map((item) => canonicalize(item, "readLater"));
  if (readLater.length < 2) throw new Error("Groq returned fewer than two read-later items");

  assertRussianText(modelDigest.summary, "summary");
  for (const [index, item] of [...items, ...readLater].entries()) {
    for (const field of ["title", "whyImportant", "audience", "nextStep"]) {
      assertRussianText(item[field], `entry ${index + 1} ${field}`);
    }
  }

  return {
    ...trustedIssue,
    status: items.length ? "active" : "quiet",
    summary: modelDigest.summary,
    items,
    readLater,
  };
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
      selectedReadLater.push(previousItem);
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
      tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
    },
    required: ["priority", "title", "source", "publishedAt", "whyImportant", "audience", "nextStep", "url", "tags"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      date: { type: "string" },
      generatedAt: { type: "string" },
      timezone: { type: "string" },
      windowHours: { type: "integer" },
      status: { type: "string", enum: ["active", "quiet"] },
      summary: { type: "string" },
      items: { type: "array", items: item, maxItems: 8 },
      readLater: { type: "array", items: item, minItems: 2, maxItems: 3 },
      sourcesChecked: { type: "integer" },
    },
    required: ["date", "generatedAt", "timezone", "windowHours", "status", "summary", "items", "readLater", "sourcesChecked"],
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
    .filter((file) => file.endsWith(".json") && file !== `${excludeDate}.json`)
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
