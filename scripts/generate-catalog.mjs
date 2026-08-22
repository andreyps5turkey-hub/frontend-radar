import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateDigest } from "./lib/digest-validation.mjs";

const archiveDirectory = resolve("data/archive");
const outputPath = resolve(archiveDirectory, "catalog.json");
const temporaryPath = resolve(archiveDirectory, "catalog.tmp.json");
const archivePattern = /^\d{4}-\d{2}-\d{2}\.json$/;

const files = (await readdir(archiveDirectory))
  .filter((file) => archivePattern.test(file))
  .sort()
  .reverse();

const issues = await Promise.all(files.map(async (file) => {
  const digest = JSON.parse(await readFile(resolve(archiveDirectory, file), "utf8"));
  validateDigest(digest);
  if (`${digest.date}.json` !== file) throw new Error(`Archive filename ${file} does not match digest date ${digest.date}.`);
  return digest;
}));

const dates = issues.map((issue) => issue.date);
if (new Set(dates).size !== dates.length) throw new Error("Archive contains duplicate dates.");

const catalog = {
  version: 1,
  updatedAt: issues[0]?.generatedAt ?? new Date(0).toISOString(),
  issues,
};

await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
console.log(`Generated archive catalog with ${issues.length} issues.`);
