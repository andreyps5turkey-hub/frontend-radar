import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const digestPath = resolve("data/digest.json");
const digest = JSON.parse(await readFile(digestPath, "utf8"));
if (!/^\d{4}-\d{2}-\d{2}$/.test(digest.date)) throw new Error("Digest date is invalid.");
const archivePath = resolve(`data/archive/${digest.date}.json`);
await mkdir(dirname(archivePath), { recursive: true });
await copyFile(digestPath, archivePath);
console.log(`Archived ${digest.date}.`);
