import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";

const projectRoot = resolve(".");
const outputDir = resolve("pages-dist");
if (!outputDir.startsWith(`${projectRoot}${sep}`) || basename(outputDir) !== "pages-dist") {
  throw new Error("Refusing to clean an unexpected export directory.");
}

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "frontend-radar";
const basePath = process.env.PAGES_BASE_PATH ?? `/${repositoryName}`;
const siteOrigin = process.env.PAGES_ORIGIN ?? "https://andreyps5turkey-hub.github.io";
const siteUrl = `${siteOrigin}${basePath}`;
const catalog = JSON.parse(await readFile(resolve("data/archive/catalog.json"), "utf8"));

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("export", String(Date.now()));
const { default: worker } = await import(workerUrl.href);
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(resolve("dist/client"), outputDir, { recursive: true });

function rewriteForPages(html) {
  return html
    .replaceAll("/_next/", `${basePath}/_next/`)
    .replaceAll('"/favicon.svg"', `"${basePath}/favicon.svg"`)
    .replaceAll('href="/archive', `href="${basePath}/archive`)
    .replaceAll('href="/feed.xml"', `href="${basePath}/feed.xml"`)
    .replace(/https?:\/\/[^"'\\<>\s]+\/og\.jpg/g, `${siteUrl}/og.jpg`);
}

async function renderRoute(route, expectedStatus = 200) {
  const requestRoute = route === "/" ? route : route.replace(/\/$/, "");
  const response = await worker.fetch(
    new Request(`${siteOrigin}${requestRoute}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  if (response.status !== expectedStatus) {
    throw new Error(`Server render for ${route} returned ${response.status}, expected ${expectedStatus}.`);
  }
  return rewriteForPages(await response.text());
}

async function writeRoute(route, html) {
  const directory = route === "/" ? outputDir : resolve(outputDir, route.replace(/^\//, ""));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "index.html"), html, "utf8");
}

const [homeHtml, archiveHtml, notFoundHtml] = await Promise.all([
  renderRoute("/"),
  renderRoute("/archive/"),
  renderRoute("/__frontend_radar_missing__", 404),
]);
await Promise.all([
  writeRoute("/", homeHtml),
  writeRoute("/archive/", archiveHtml),
  writeFile(resolve(outputDir, "404.html"), notFoundHtml, "utf8"),
]);

const archiveRoutes = catalog.issues.map(({ date }) => `/archive/${date}/`);
for (let index = 0; index < archiveRoutes.length; index += 12) {
  const batch = archiveRoutes.slice(index, index + 12);
  const pages = await Promise.all(batch.map(async (route) => [route, await renderRoute(route)]));
  await Promise.all(pages.map(([route, html]) => writeRoute(route, html)));
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function issueDescription(issue) {
  const entries = [...issue.items, ...issue.readLater];
  const list = entries.map((item) => `<li><a href="${escapeXml(item.url)}">${escapeXml(item.title)}</a> — ${escapeXml(item.whyImportant)}</li>`).join("");
  return `<p>${escapeXml(issue.summary)}</p><ul>${list}</ul>`;
}

function russianIssueDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(`${value}T12:00:00+03:00`));
}

const feedItems = catalog.issues.slice(0, 30).map((issue) => {
  const link = `${siteUrl}/archive/${issue.date}/`;
  return `  <item>
    <title>${escapeXml(`Frontend Radar — выпуск за ${russianIssueDate(issue.date)}`)}</title>
    <link>${escapeXml(link)}</link>
    <guid isPermaLink="true">${escapeXml(link)}</guid>
    <pubDate>${new Date(issue.generatedAt).toUTCString()}</pubDate>
    <description>${escapeXml(issueDescription(issue))}</description>
  </item>`;
}).join("\n");

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Frontend Radar</title>
  <link>${escapeXml(`${siteUrl}/`)}</link>
  <description>Ежедневная русская подборка по React и фронтенду</description>
  <language>ru</language>
  <lastBuildDate>${new Date(catalog.updatedAt).toUTCString()}</lastBuildDate>
  <atom:link href="${escapeXml(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml" />
${feedItems}
</channel>
</rss>
`;

await writeFile(resolve(outputDir, "feed.xml"), feed, "utf8");
await writeFile(resolve(outputDir, ".nojekyll"), "", "utf8");
console.log(`Exported ${archiveRoutes.length + 3} GitHub Pages routes and RSS to ${outputDir} with base path ${basePath}.`);
