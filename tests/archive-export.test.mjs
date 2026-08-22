import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { XMLParser } from "fast-xml-parser";
import { validateDigest } from "../scripts/lib/digest-validation.mjs";

test("catalog contains every dated archive in newest-first order", async () => {
  const [catalogText, files] = await Promise.all([
    readFile(new URL("../data/archive/catalog.json", import.meta.url), "utf8"),
    readdir(new URL("../data/archive/", import.meta.url)),
  ]);
  const catalog = JSON.parse(catalogText);
  const datedFiles = files.filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file));
  assert.equal(catalog.version, 1);
  assert.equal(catalog.issues.length, datedFiles.length);
  assert.deepEqual(catalog.issues.map(({ date }) => date), [...catalog.issues.map(({ date }) => date)].sort().reverse());
  catalog.issues.forEach((issue) => validateDigest(issue));
});

test("static export contains archive and weekly pages, a real 404 and a valid RSS feed", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/archive/catalog.json", import.meta.url), "utf8"));
  const [archiveHtml, weeklyHtml, notFoundHtml, feedText] = await Promise.all([
    readFile(new URL("../pages-dist/archive/index.html", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/weekly/index.html", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/404.html", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/feed.xml", import.meta.url), "utf8"),
  ]);
  assert.match(archiveHtml, /Архив Frontend Radar/);
  assert.match(archiveHtml, /\/frontend-radar\/archive\//);
  assert.match(weeklyHtml, /Неделя во фронтенде/);
  assert.match(weeklyHtml, /\/frontend-radar\/weekly\//);
  assert.match(notFoundHtml, /Такого выпуска нет/);

  for (const issue of catalog.issues) {
    const page = new URL(`../pages-dist/archive/${issue.date}/index.html`, import.meta.url);
    assert.ok((await readFile(page, "utf8")).includes(issue.summary));
  }

  const parsed = new XMLParser().parse(feedText);
  const items = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
  assert.equal(items.length, Math.min(30, catalog.issues.length));
  assert.equal(new Set(items.map(({ guid }) => typeof guid === "string" ? guid : guid["#text"])).size, items.length);
  for (const item of items) {
    assert.match(item.title, /[А-Яа-яЁё]/);
    assert.match(item.link, /^https:\/\/andreyps5turkey-hub\.github\.io\/frontend-radar\/archive\//);
  }
});
