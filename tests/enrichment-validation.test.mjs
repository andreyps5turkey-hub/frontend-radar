import assert from "node:assert/strict";
import test from "node:test";
import { validateDigest } from "../scripts/lib/digest-validation.mjs";

const legacy = {
  date: "2026-08-01",
  generatedAt: "2026-08-01T05:00:00.000Z",
  timezone: "Europe/Moscow",
  windowHours: 26,
  status: "quiet",
  summary: "Значимых событий нет.",
  items: [],
  readLater: [
    { priority: "P3", title: "Полезный материал о React", source: "React", publishedAt: "2026-07-31T05:00:00.000Z", whyImportant: "Помогает разобраться в React.", audience: "Разработчики React.", nextStep: "Прочитать конспект.", url: "https://example.com/one", tags: ["React"] },
    { priority: "P3", title: "Обзор TypeScript", source: "TypeScript", publishedAt: "2026-07-30T05:00:00.000Z", whyImportant: "Объясняет изменения TypeScript.", audience: "Разработчики TypeScript.", nextStep: "Проверить примеры.", url: "https://example.com/two", tags: ["TypeScript"] },
  ],
  sourcesChecked: 20,
};

test("legacy issues remain valid while schema v2 requires enrichment", () => {
  assert.equal(validateDigest(structuredClone(legacy)).date, legacy.date);
  const v2 = { ...structuredClone(legacy), schemaVersion: 2 };
  assert.throws(() => validateDigest(v2), /changeType is invalid/);
});
