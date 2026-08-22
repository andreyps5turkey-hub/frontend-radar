import { readFile } from "node:fs/promises";
import { inspectArticleUrls } from "./lib/link-health.mjs";

const [digest, packageCatalog] = await Promise.all([
  readFile(new URL("../data/digest.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../data/packages/catalog.json", import.meta.url), "utf8").then(JSON.parse),
]);
const urls = [
  ...[...digest.items, ...digest.readLater].map(({ url }) => url),
  ...packageCatalog.packages.flatMap((item) => [
    item.npmUrl,
    item.repositoryUrl,
    ...item.events.map(({ url }) => url),
    ...item.advisories.map(({ url }) => url),
  ]),
];
const results = await inspectArticleUrls(urls);
const dead = results.filter(({ state }) => state === "dead");
const warnings = results.filter(({ state }) => state === "warning");

for (const result of warnings) console.warn(`Не удалось подтвердить ссылку (${result.detail}): ${result.url}`);
for (const result of dead) console.error(`Нерабочая ссылка (${result.detail}): ${result.url}`);

if (dead.length) {
  throw new Error(`Публикация остановлена: найдено нерабочих ссылок — ${dead.length}.`);
}

console.log(`Проверено ссылок: ${results.length}; подтверждено: ${results.length - warnings.length}; предупреждений: ${warnings.length}.`);
