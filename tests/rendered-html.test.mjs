import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Frontend Radar<\/title>/i);
  assert.match(html, /Короткая русская подборка по React и фронтенду/);
  assert.match(html, /08:00/);
  assert.match(html, /Next\.js 16\.3\.2 исправляет маршрутизацию/);
  assert.match(html, /ESLint 10\.9\.0 делает автоисправления/);
  assert.match(html, /Вышел TypeScript 7\.0/);
  assert.match(html, /Vite 8\.2/);
  assert.match(html, /React Foundation начала работу/);
  assert.match(html, /Читать оригинал/);
  assert.match(html, /https:\/\/devblogs\.microsoft\.com\/typescript/);
  assert.match(html, /og\.jpg/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
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
  const [digestText, workflow, packageJson] = await Promise.all([
    readFile(new URL("../data/digest.json", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const digest = JSON.parse(digestText);
  const scripts = JSON.parse(packageJson).scripts;

  assert.equal(digest.timezone, "Europe/Moscow");
  assert.equal(digest.status, "active");
  assert.equal(digest.items.length, 2);
  assert.equal(digest.readLater.length, 3);
  assert.match(workflow, /cron: "0 5 \* \* \*"/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.equal(scripts["digest:collect"], "node scripts/collect-news.mjs");
  assert.equal(scripts["pages:export"], "node scripts/export-pages.mjs");
});
