import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { valid, validRange } from "semver";

test("package catalog has ten unique groups and deduplicated advisories", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/packages/catalog.json", import.meta.url), "utf8"));
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.packages.length, 10);
  assert.equal(new Set(catalog.packages.map(({ slug }) => slug)).size, 10);
  assert.equal(catalog.sourceHealth.attempted, 28);
  for (const group of catalog.packages) {
    assert.ok(group.packageNames.length > 0);
    assert.equal(new Set(group.advisories.map(({ ghsaId }) => ghsaId)).size, group.advisories.length, `${group.slug} has duplicate advisories`);
    for (const item of group.packages) {
      assert.ok(item.versions.every(({ version }) => valid(version)));
      assert.ok(item.compatibility.every(({ range }) => validRange(range)));
      assert.ok(new Set(item.versions.map(({ version }) => Number(version.split(".")[0]))).size <= 4);
    }
  }
});
