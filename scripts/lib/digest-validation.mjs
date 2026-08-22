const priorities = new Set(["P0", "P1", "P2", "P3"]);

export function validateDigest(digest, { requireSourceHealth = false } = {}) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`Invalid digest: ${message}`);
  };
  const assertRussian = (value, field) => {
    assert(/[А-Яа-яЁё]/.test(value), `${field} must contain Russian text`);
  };

  const validateItem = (item, index, group) => {
    assert(item && typeof item === "object", `${group}[${index}] must be an object`);
    assert(priorities.has(item.priority), `${group}[${index}].priority is invalid`);
    for (const field of ["title", "source", "publishedAt", "whyImportant", "audience", "nextStep", "url"]) {
      assert(typeof item[field] === "string" && item[field].trim(), `${group}[${index}].${field} is required`);
    }
    assert(item.title.length <= 190, `${group}[${index}].title is too long`);
    assert(item.whyImportant.length <= 700, `${group}[${index}].whyImportant is too long`);
    assert(item.audience.length <= 500, `${group}[${index}].audience is too long`);
    assert(item.nextStep.length <= 500, `${group}[${index}].nextStep is too long`);
    for (const field of ["title", "whyImportant", "audience", "nextStep"]) {
      assertRussian(item[field], `${group}[${index}].${field}`);
    }
    assert(!Number.isNaN(Date.parse(item.publishedAt)), `${group}[${index}].publishedAt is invalid`);
    const url = new URL(item.url);
    assert(url.protocol === "https:", `${group}[${index}].url must use HTTPS`);
    assert(Array.isArray(item.tags) && item.tags.length >= 1 && item.tags.length <= 5, `${group}[${index}].tags is invalid`);
  };

  assert(digest && typeof digest === "object", "digest must be an object");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(digest.date), "date must use YYYY-MM-DD");
  assert(!Number.isNaN(Date.parse(digest.generatedAt)), "generatedAt is invalid");
  assert(digest.timezone === "Europe/Moscow", "timezone must be Europe/Moscow");
  assert(Number.isInteger(digest.windowHours) && digest.windowHours >= 24, "windowHours is invalid");
  assert(["active", "quiet"].includes(digest.status), "status is invalid");
  assert(typeof digest.summary === "string" && digest.summary.trim(), "summary is required");
  assertRussian(digest.summary, "summary");
  assert(Array.isArray(digest.items) && digest.items.length <= 8, "items must contain no more than 8 entries");
  assert(Array.isArray(digest.readLater) && digest.readLater.length >= 2 && digest.readLater.length <= 3, "readLater must contain 2 or 3 entries");
  assert(Number.isInteger(digest.sourcesChecked) && digest.sourcesChecked > 0, "sourcesChecked is invalid");

  if (requireSourceHealth || digest.sourceHealth != null) {
    const health = digest.sourceHealth;
    assert(health && typeof health === "object", "sourceHealth is required");
    assert(Number.isInteger(health.attempted) && health.attempted > 0, "sourceHealth.attempted is invalid");
    assert(Number.isInteger(health.succeeded) && health.succeeded > 0, "sourceHealth.succeeded is invalid");
    assert(health.succeeded <= health.attempted, "sourceHealth succeeded exceeds attempted");
    assert(Array.isArray(health.failed), "sourceHealth.failed must be an array");
    assert(health.failed.every((name) => typeof name === "string" && name.trim()), "sourceHealth.failed contains an invalid source");
    assert(new Set(health.failed).size === health.failed.length, "sourceHealth.failed contains duplicates");
    assert(health.attempted - health.succeeded === health.failed.length, "sourceHealth counts do not match failed sources");
    assert(digest.sourcesChecked === health.succeeded, "sourcesChecked does not match sourceHealth.succeeded");
  }

  digest.items.forEach((item, index) => validateItem(item, index, "items"));
  digest.readLater.forEach((item, index) => validateItem(item, index, "readLater"));
  assert(digest.status === (digest.items.length ? "active" : "quiet"), "status does not match items");

  const urls = [...digest.items, ...digest.readLater].map((item) => item.url);
  assert(new Set(urls).size === urls.length, "item URLs must be unique within a digest");
  return digest;
}
