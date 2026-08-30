import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

let workerPromise;

async function getWorker() {
  if (workerPromise) return workerPromise;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  workerPromise = import(workerUrl.href).then((module) => module.default);
  return workerPromise;
}

async function render(path = "/") {
  const worker = await getWorker();
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the frontend radar", async () => {
  const digest = JSON.parse(await readFile(new URL("../data/digest.json", import.meta.url), "utf8"));
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Frontend Radar<\/title>/i);
  assert.match(html, /Короткая русская подборка по React и фронтенду/);
  assert.match(html, /08:00/);
  for (const item of [...digest.items, ...digest.readLater]) {
    assert.ok(html.includes(item.title), `missing digest title: ${item.title}`);
    assert.ok(html.includes(`href="${item.url}"`), `missing original article link: ${item.url}`);
  }
  assert.match(html, /Читать оригинал/);
  assert.match(html, /Неделя в одном экране/);
  assert.match(html, /React Stack Check/);
  assert.match(html, /frontend-radar-hero-v2\.jpg/);
  assert.match(html, /og\.jpg/);
  assert.match(html, /Создал/);
  assert.match(html, /andrei\.chebasov/);
  assert.doesNotMatch(html, /GitHub Actions|Автоматизация/);
  assert.doesNotMatch(html, /Исходный код на GitHub|github\.com\/andreyps5turkey-hub\/frontend-radar/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("server-renders an automatically ranked weekly digest", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/archive/catalog.json", import.meta.url), "utf8"));
  const response = await render("/weekly");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Неделя во фронтенде/);
  assert.match(html, /Что не стоит пропустить/);
  assert.match(html, /Пульс приоритетов/);
  assert.match(html, /Как развивалась неделя/);
  assert.match(html, /По сравнению с прошлой неделей/);

  const latest = Date.parse(`${catalog.issues[0].date}T12:00:00Z`);
  const issues = catalog.issues.filter(({ date }) => Date.parse(`${date}T12:00:00Z`) >= latest - 6 * 86400000);
  const seen = new Set();
  const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const highlights = issues.flatMap((issue) => [...issue.items, ...issue.readLater]
    .filter((item) => !seen.has(item.url) && seen.add(item.url)))
    .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority]
      || Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 7);
  for (const item of highlights) assert.ok(html.includes(item.title));
  for (const item of highlights) assert.ok(html.includes(`href="${item.url}"`), `weekly title does not link to original: ${item.url}`);
});

test("server-renders the local project workspace", async () => {
  const response = await render("/project");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /React Stack Check/);
  assert.match(html, /Перетащите package\.json и lock-файл/);
  assert.match(html, /Добавьте package\.json/);
  assert.match(html, /Что проверить и обновить/);
  assert.match(html, /Только на устройстве/);
});

test("server-renders package directory, package details and package data", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/packages/catalog.json", import.meta.url), "utf8"));
  const directoryResponse = await render("/packages");
  assert.equal(directoryResponse.status, 200);
  const directoryHtml = await directoryResponse.text();
  assert.match(directoryHtml, /Пакеты React-стека/);
  assert.match(directoryHtml, /Каталог частично устарел|Источники отвечают/);
  assert.match(directoryHtml, /Успешно/);
  for (const item of catalog.packages) {
    assert.ok(directoryHtml.includes(item.label));
    assert.match(directoryHtml, new RegExp(`href="(?:/frontend-radar)?/packages/${item.slug}/"`));
  }

  const item = catalog.packages.find(({ slug }) => slug === "next") ?? catalog.packages[0];
  const packageResponse = await render(`/packages/${item.slug}`);
  assert.equal(packageResponse.status, 200);
  const packageHtml = await packageResponse.text();
  assert.ok(packageHtml.includes(`${item.label}: релизы и совместимость`));
  assert.match(packageHtml, /Совместимость major-линий/);
  assert.match(packageHtml, /Что проверить перед обновлением/);
  assert.ok(packageHtml.includes(`href="${item.npmUrl}"`));

  const dataResponse = await render("/package-catalog.json");
  assert.equal(dataResponse.status, 200);
  assert.match(dataResponse.headers.get("content-type") ?? "", /application\/json/);
  assert.equal((await dataResponse.json()).schemaVersion, 1);
});

test("server-renders archive search and permanent issue pages", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/archive/catalog.json", import.meta.url), "utf8"));
  const archiveResponse = await render("/archive");
  assert.equal(archiveResponse.status, 200);
  const archiveHtml = await archiveResponse.text();
  assert.match(archiveHtml, /Архив Frontend Radar/);
  assert.match(archiveHtml, /Поиск по архиву/);

  const issue = catalog.issues[0];
  const issueResponse = await render(`/archive/${issue.date}`);
  assert.equal(issueResponse.status, 200);
  const issueHtml = await issueResponse.text();
  assert.ok(issueHtml.includes(issue.summary));
  for (const item of [...issue.items, ...issue.readLater]) assert.ok(issueHtml.includes(item.title));

  const missingResponse = await render("/archive/1900-01-01");
  assert.equal(missingResponse.status, 404);
  assert.match(await missingResponse.text(), /Такого выпуска нет/);
});

test("removes disposable starter preview references", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("ships daily automation and a valid Russian digest", async () => {
  const [digestText, workflow, packageJson, curator] = await Promise.all([
    readFile(new URL("../data/digest.json", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/curate-with-groq.mjs", import.meta.url), "utf8"),
  ]);
  const digest = JSON.parse(digestText);
  const scripts = JSON.parse(packageJson).scripts;

  assert.equal(digest.timezone, "Europe/Moscow");
  assert.equal(digest.status, digest.items.length ? "active" : "quiet");
  assert.ok(digest.items.length <= 8);
  assert.ok(digest.readLater.length >= 2 && digest.readLater.length <= 3);
  assert.match(digest.summary, /[А-Яа-яЁё]/);
  for (const item of [...digest.items, ...digest.readLater]) {
    for (const field of ["title", "whyImportant", "audience", "nextStep"]) {
      assert.match(item[field], /[А-Яа-яЁё]/, `${field} must contain Russian text`);
    }
  }
  assert.match(workflow, /cron: "37 4 \* \* \*"/);
  assert.match(workflow, /cron: "17 5 \* \* \*"/);
  assert.match(workflow, /cron: "17 6 \* \* \*"/);
  assert.match(workflow, /cron: "17 12 \* \* \*"/);
  assert.match(workflow, /Decide whether digest refresh is needed/);
  assert.match(workflow, /TZ=Europe\/Moscow date \+%F/);
  assert.match(workflow, /should_refresh/);
  assert.match(workflow, /retry Russian curation after fallback/);
  assert.match(workflow, /timeout-minutes: 20/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /pnpm run test:built/);
  assert.match(workflow, /pnpm run digest:links/);
  assert.match(workflow, /GROQ_API_KEY: \$\{\{ secrets\.GROQ \}\}/);
  assert.match(workflow, /github\.actor.*github-actions\[bot\]/);
  assert.doesNotMatch(workflow, /Copilot|copilot-requests/i);
  assert.match(curator, /openai\/gpt-oss-20b/);
  assert.match(curator, /json_schema/);
  assert.match(curator, /normalizedList/);
  assert.doesNotMatch(curator, /maxItems/);
  assert.doesNotMatch(curator, /enum:/);
  assert.equal(scripts["digest:collect"], "node scripts/collect-news.mjs");
  assert.equal(scripts["digest:curate"], "node scripts/curate-with-groq.mjs");
  assert.equal(scripts["digest:catalog"], "node scripts/generate-catalog.mjs");
  assert.equal(scripts["packages:refresh"], "node scripts/generate-package-catalog.mjs");
  assert.equal(scripts["digest:links"], "node scripts/validate-article-links.mjs");
  assert.equal(scripts["pages:export"], "node scripts/export-pages.mjs");
  assert.match(workflow, /Refresh package intelligence/);
  assert.match(workflow, /data\/packages\/catalog\.json/);
});
