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
  assert.equal(catalog.version, 2);
  assert.equal(catalog.issues.length, datedFiles.length);
  assert.deepEqual(catalog.issues.map(({ date }) => date), [...catalog.issues.map(({ date }) => date)].sort().reverse());
  catalog.issues.forEach((issue) => validateDigest(issue));
});

test("static export contains archive, project and package pages, SEO files, a real 404 and a valid RSS feed", async () => {
  const [catalog, packageCatalog] = await Promise.all([
    readFile(new URL("../data/archive/catalog.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/packages/catalog.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const [archiveHtml, weeklyHtml, projectHtml, packagesHtml, packageDataText, notFoundHtml, feedText, sitemapText, robotsText] = await Promise.all([
    readFile(new URL("../pages-dist/archive/index.html", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/weekly/index.html", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/project/index.html", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/packages/index.html", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/package-catalog.json", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/404.html", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/feed.xml", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/sitemap.xml", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/robots.txt", import.meta.url), "utf8"),
  ]);
  assert.match(archiveHtml, /Архив Frontend Radar/);
  assert.match(archiveHtml, /\/frontend-radar\/archive\//);
  assert.match(weeklyHtml, /Неделя во фронтенде/);
  assert.match(weeklyHtml, /\/frontend-radar\/weekly\//);
  assert.match(projectHtml, /React Stack Check/);
  assert.match(projectHtml, /Перетащите package\.json и lock-файл/);
  assert.match(projectHtml, /\/frontend-radar\/project\//);
  assert.match(packagesHtml, /Пакеты React-стека/);
  assert.match(packagesHtml, /\/frontend-radar\/packages\//);
  assert.equal(JSON.parse(packageDataText).schemaVersion, 1);
  assert.match(notFoundHtml, /Такого выпуска нет/);

  for (const issue of catalog.issues) {
    const page = new URL(`../pages-dist/archive/${issue.date}/index.html`, import.meta.url);
    assert.ok((await readFile(page, "utf8")).includes(issue.summary));
  }

  for (const item of packageCatalog.packages) {
    const page = new URL(`../pages-dist/packages/${item.slug}/index.html`, import.meta.url);
    const html = await readFile(page, "utf8");
    assert.ok(html.includes(`${item.label}: релизы и совместимость`));
    assert.ok(html.includes(item.npmUrl));
    assert.match(sitemapText, new RegExp(`/frontend-radar/packages/${item.slug}/`));
  }
  assert.match(robotsText, /Sitemap: https:\/\/andreyps5turkey-hub\.github\.io\/frontend-radar\/sitemap\.xml/);
  const clientFiles = await readdir(new URL("../pages-dist/_next/static/chunks/", import.meta.url));
  const clientSources = await Promise.all(clientFiles.filter((file) => file.endsWith(".js")).map((file) => readFile(new URL(`../pages-dist/_next/static/chunks/${file}`, import.meta.url), "utf8")));
  assert.ok(clientSources.some((source) => source.includes("/frontend-radar") && source.includes("/package-catalog.json")), "client package catalog URL must include the GitHub Pages base path");

  const parsed = new XMLParser().parse(feedText);
  const items = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
  assert.equal(items.length, Math.min(30, catalog.issues.length));
  assert.equal(new Set(items.map(({ guid }) => typeof guid === "string" ? guid : guid["#text"])).size, items.length);
  for (const item of items) {
    assert.match(item.title, /[А-Яа-яЁё]/);
    assert.match(item.link, /^https:\/\/andreyps5turkey-hub\.github\.io\/frontend-radar\/archive\//);
  }
});
