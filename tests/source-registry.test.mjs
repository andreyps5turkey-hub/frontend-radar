import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedReactorSources = [
  "Node.js Releases",
  "DOMPurify Releases",
  "Vite React Plugins",
  "SWC Releases",
  "core-js Releases",
  "typescript-eslint Releases",
  "Stylelint Releases",
  "Jest Releases",
  "Testing Library React",
  "Puppeteer Releases",
  "Yarn Berry Releases",
];

const excludedSources = [
  "React Security",
  "Vite Security",
  "DOMPurify Security",
  "Temporal Polyfill Releases",
  "IMask Releases",
  "Shiki Releases",
  "Sass Embedded Releases",
  "PostCSS Releases",
  "Browserslist Releases",
  "MCP TypeScript SDK",
];

test("source registry contains only the approved high-signal Reactor additions", async () => {
  const sources = JSON.parse(await readFile(new URL("../data/sources.json", import.meta.url), "utf8"));
  const names = sources.map(({ name }) => name);
  const endpoints = sources.map(({ url, api }) => url ?? api);

  assert.equal(sources.length, 32);
  assert.equal(new Set(names).size, names.length, "source names must be unique");
  assert.equal(new Set(endpoints).size, endpoints.length, "source endpoints must be unique");

  for (const source of sources) {
    assert.equal(typeof source.name, "string");
    assert.ok(["P0", "P1", "P2", "P3"].includes(source.group));
    assert.equal(Number.isFinite(source.weight), true);
    assert.equal(Array.isArray(source.packages), true);
    assert.equal(Boolean(source.url) !== Boolean(source.api), true, `${source.name} must define one endpoint`);
    assert.match(source.url ?? source.api, /^https:\/\//);
  }

  for (const name of expectedReactorSources) assert.ok(names.includes(name), `missing approved source: ${name}`);
  for (const name of excludedSources) assert.ok(!names.includes(name), `excluded source is still present: ${name}`);
});
