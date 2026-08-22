const hardFailureStatuses = new Set([404, 410]);

export async function inspectArticleUrl(url, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { url, state: "dead", detail: "некорректный URL" };
  }

  if (parsed.protocol !== "https:") {
    return { url, state: "dead", detail: "ссылка должна использовать HTTPS" };
  }

  try {
    const response = await fetchImpl(parsed, {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "text/html, application/xhtml+xml, application/json;q=0.9, */*;q=0.5",
        range: "bytes=0-2047",
        "user-agent": "frontend-radar-link-check/1.0 (+https://github.com/andreyps5turkey-hub/frontend-radar)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.body?.cancel) await response.body.cancel();

    if (response.ok || (response.status >= 300 && response.status < 400)) {
      return { url, state: "ok", status: response.status };
    }
    if (hardFailureStatuses.has(response.status)) {
      return { url, state: "dead", status: response.status, detail: `HTTP ${response.status}` };
    }
    return { url, state: "warning", status: response.status, detail: `HTTP ${response.status}` };
  } catch (error) {
    return {
      url,
      state: "warning",
      detail: error instanceof Error ? error.message : "ошибка сети",
    };
  }
}

export async function inspectArticleUrls(urls, options = {}) {
  const uniqueUrls = [...new Set(urls)];
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 5, uniqueUrls.length || 1));
  const results = new Array(uniqueUrls.length);
  let cursor = 0;

  async function worker() {
    while (cursor < uniqueUrls.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await inspectArticleUrl(uniqueUrls[index], options);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
