import { cp, mkdir, rm, writeFile } from "node:fs/promises";
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

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("export", String(Date.now()));
const { default: worker } = await import(workerUrl.href);
const response = await worker.fetch(
  new Request(`${siteOrigin}/`),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);
if (!response.ok) throw new Error(`Server render failed with ${response.status}.`);

let html = await response.text();
html = html
  .replaceAll("/_next/", `${basePath}/_next/`)
  .replaceAll('"/favicon.svg"', `"${basePath}/favicon.svg"`)
  .replace(/https?:\/\/[^"'\\<>\s]+\/og\.jpg/g, `${siteUrl}/og.jpg`);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(resolve("dist/client"), outputDir, { recursive: true });
await writeFile(resolve(outputDir, "index.html"), html, "utf8");
await writeFile(resolve(outputDir, "404.html"), html, "utf8");
await writeFile(resolve(outputDir, ".nojekyll"), "", "utf8");
console.log(`Exported GitHub Pages site to ${outputDir} with base path ${basePath}.`);
