import { readFile, writeFile } from "node:fs/promises";
import { validateDigest } from "./lib/digest-validation.mjs";

const digestUrl = new URL("../data/digest.json", import.meta.url);
const digest = JSON.parse(await readFile(digestUrl, "utf8"));
const allowedPriorities = new Set(["P0", "P1", "P2", "P3"]);

let repairedPriorities = 0;
for (const [groupName, items] of [["items", digest.items ?? []], ["readLater", digest.readLater ?? []]]) {
  for (const [index, item] of items.entries()) {
    const normalized = normalizePriority(item);
    if (item.priority !== normalized) {
      console.warn(`Normalized ${groupName}[${index}].priority from ${JSON.stringify(item.priority)} to ${normalized}.`);
      item.priority = normalized;
      repairedPriorities += 1;
    }
  }
}

if (repairedPriorities > 0) {
  await writeFile(digestUrl, `${JSON.stringify(digest, null, 2)}\n`, "utf8");
}

validateDigest(digest);
console.log(`Digest ${digest.date} is valid: ${digest.items.length} active, ${digest.readLater.length} read later.`);

function normalizePriority(item) {
  const raw = typeof item?.priority === "string" ? item.priority.trim().toUpperCase() : "";
  if (allowedPriorities.has(raw)) return raw;

  if (item?.changeType === "security" || item?.risk === "critical") return "P0";
  if (["breaking", "major"].includes(item?.changeType) || item?.risk === "high") return "P1";
  if (["minor", "tooling"].includes(item?.changeType) || item?.risk === "medium") return "P2";
  return "P3";
}
