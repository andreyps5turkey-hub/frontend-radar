import assert from "node:assert/strict";
import test from "node:test";
import { inspectArticleUrl, inspectArticleUrls } from "../scripts/lib/link-health.mjs";

function response(status) {
  return new Response("", { status });
}

test("article link checker accepts reachable links and redirects", async () => {
  const ok = await inspectArticleUrl("https://example.com/article", { fetchImpl: async () => response(200) });
  const redirect = await inspectArticleUrl("https://example.com/moved", { fetchImpl: async () => response(302) });
  assert.equal(ok.state, "ok");
  assert.equal(redirect.state, "ok");
});

test("article link checker blocks definite dead links", async () => {
  const notFound = await inspectArticleUrl("https://example.com/missing", { fetchImpl: async () => response(404) });
  const gone = await inspectArticleUrl("https://example.com/gone", { fetchImpl: async () => response(410) });
  const invalid = await inspectArticleUrl("http://example.com/insecure");
  assert.equal(notFound.state, "dead");
  assert.equal(gone.state, "dead");
  assert.equal(invalid.state, "dead");
});

test("article link checker keeps temporary blocks as warnings", async () => {
  const forbidden = await inspectArticleUrl("https://example.com/private", { fetchImpl: async () => response(403) });
  const unavailable = await inspectArticleUrl("https://example.com/slow", { fetchImpl: async () => { throw new Error("timeout"); } });
  assert.equal(forbidden.state, "warning");
  assert.equal(unavailable.state, "warning");
});

test("article link checker deduplicates URLs", async () => {
  let calls = 0;
  const results = await inspectArticleUrls([
    "https://example.com/article",
    "https://example.com/article",
    "https://example.com/other",
  ], { fetchImpl: async () => { calls += 1; return response(200); }, concurrency: 2 });
  assert.equal(calls, 2);
  assert.equal(results.length, 2);
});
