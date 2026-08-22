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
  }
  assert.match(html, /Читать оригинал/);
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
  assert.match(workflow, /cron: "0 5 \* \* \*"/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /GROQ_API_KEY: \$\{\{ secrets\.GROQ \}\}/);
  assert.match(workflow, /github\.actor != 'github-actions\[bot\]'/);
  assert.doesNotMatch(workflow, /Copilot|copilot-requests/i);
  assert.match(curator, /openai\/gpt-oss-20b/);
  assert.match(curator, /json_schema/);
  assert.equal(scripts["digest:collect"], "node scripts/collect-news.mjs");
  assert.equal(scripts["digest:curate"], "node scripts/curate-with-groq.mjs");
  assert.equal(scripts["pages:export"], "node scripts/export-pages.mjs");
});
