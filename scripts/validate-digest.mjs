import { readFile } from "node:fs/promises";
import { validateDigest } from "./lib/digest-validation.mjs";

const digest = JSON.parse(await readFile(new URL("../data/digest.json", import.meta.url), "utf8"));
validateDigest(digest);
console.log(`Digest ${digest.date} is valid: ${digest.items.length} active, ${digest.readLater.length} read later.`);
