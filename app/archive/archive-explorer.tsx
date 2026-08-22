"use client";

import { Bookmark, Check, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useDeferredValue, useMemo, useSyncExternalStore } from "react";
import type { ArchiveCatalog, DigestItem, Priority } from "@/lib/digest";
import { formatIssueDate, formatMaterialCount, itemAnchor, priorityLabels } from "@/lib/digest";
import { archivePath } from "@/lib/site";
import { topicIdsForItem, topics, type TopicId } from "@/lib/topics";
import { useReadingState } from "../reading-state";

type Filters = {
  query: string;
  priorities: Priority[];
  source: string;
  topic: TopicId | "";
  savedOnly: boolean;
  unreadOnly: boolean;
  myTopics: boolean;
};

type IndexedEntry = {
  issueDate: string;
  issueSummary: string;
  item: DigestItem;
};

const defaultFilters: Filters = {
  query: "",
  priorities: [],
  source: "",
  topic: "",
  savedOnly: false,
  unreadOnly: false,
  myTopics: false,
};

const urlListeners = new Set<() => void>();

function subscribeToUrl(listener: () => void) {
  urlListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    urlListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function filtersFromSearch(search: string): Filters {
  const params = new URLSearchParams(search);
  const priorities = (params.get("priority")?.split(",") ?? [])
    .filter((value): value is Priority => ["P0", "P1", "P2", "P3"].includes(value));
  const topic = params.get("topic") ?? "";
  return {
    query: params.get("q") ?? "",
    priorities,
    source: params.get("source") ?? "",
    topic: topics.some((item) => item.id === topic) ? topic as TopicId : "",
    savedOnly: params.get("saved") === "1",
    unreadOnly: params.get("unread") === "1",
    myTopics: params.get("mine") === "1",
  };
}

function filtersToSearch(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.priorities.length) params.set("priority", filters.priorities.join(","));
  if (filters.source) params.set("source", filters.source);
  if (filters.topic) params.set("topic", filters.topic);
  if (filters.savedOnly) params.set("saved", "1");
  if (filters.unreadOnly) params.set("unread", "1");
  if (filters.myTopics) params.set("mine", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}

function replaceFilters(filters: Filters) {
  window.history.replaceState(null, "", `${window.location.pathname}${filtersToSearch(filters)}`);
  for (const listener of urlListeners) listener();
}

function searchableText(entry: IndexedEntry) {
  const { item, issueSummary } = entry;
  return [item.title, item.source, item.whyImportant, item.audience, item.nextStep, item.tags.join(" "), issueSummary]
    .join(" ")
    .toLocaleLowerCase("ru-RU");
}

function ArchiveResult({ entry }: { entry: IndexedEntry }) {
  const { hydrated, reading, toggleRead, toggleSaved } = useReadingState();
  const state = reading[entry.item.url];
  const isRead = hydrated && Boolean(state?.read);
  const isSaved = hydrated && Boolean(state?.saved);
  const href = `${archivePath(entry.issueDate)}#${itemAnchor(entry.item.url)}`;

  return (
    <article className={`archive-result${isRead ? " archive-result--read" : ""}`}>
      <div className="archive-result__priority">
        <span className={`priority priority--${entry.item.priority}`}>{entry.item.priority}</span>
      </div>
      <div className="archive-result__copy">
        <div className="archive-result__meta">
          <span>{entry.item.source}</span>
          <span>{priorityLabels[entry.item.priority]}</span>
        </div>
        <h3><a href={href}>{entry.item.title}</a></h3>
        <p>{entry.item.whyImportant}</p>
        <div className="tag-row" aria-label="Темы материала">
          {entry.item.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </div>
      <div className="archive-result__actions">
        <button
          className={`icon-button${isSaved ? " is-active" : ""}`}
          type="button"
          aria-label={isSaved ? "Убрать из сохранённых" : "Сохранить материал"}
          aria-pressed={isSaved}
          title={isSaved ? "Убрать из сохранённых" : "Сохранить"}
          onClick={() => toggleSaved(entry.item.url)}
        >
          <Bookmark aria-hidden="true" size={17} fill={isSaved ? "currentColor" : "none"} />
        </button>
        <button
          className={`icon-button${isRead ? " is-active" : ""}`}
          type="button"
          aria-label={isRead ? "Отметить непрочитанным" : "Отметить прочитанным"}
          aria-pressed={isRead}
          title={isRead ? "Отметить непрочитанным" : "Отметить прочитанным"}
          onClick={() => toggleRead(entry.item.url)}
        >
          <Check aria-hidden="true" size={18} />
        </button>
      </div>
    </article>
  );
}

export function ArchiveExplorer({ catalog }: { catalog: ArchiveCatalog }) {
  const { hydrated, reading, selectedTopics, toggleTopic } = useReadingState();
  const search = useSyncExternalStore(subscribeToUrl, () => window.location.search, () => "");
  const filters = useMemo(() => filtersFromSearch(search), [search]);
  const deferredQuery = useDeferredValue(filters.query.trim().toLocaleLowerCase("ru-RU"));

  const entries = useMemo<IndexedEntry[]>(() => catalog.issues.flatMap((issue) =>
    [...issue.items, ...issue.readLater].map((item) => ({
      issueDate: issue.date,
      issueSummary: issue.summary,
      item,
    }))), [catalog]);

  const sources = useMemo(() => [...new Set(entries.map(({ item }) => item.source))]
    .sort((left, right) => left.localeCompare(right, "ru")), [entries]);

  const results = useMemo(() => entries.filter((entry) => {
    const itemTopics = topicIdsForItem(entry.item);
    if (deferredQuery && !searchableText(entry).includes(deferredQuery)) return false;
    if (filters.priorities.length && !filters.priorities.includes(entry.item.priority)) return false;
    if (filters.source && filters.source !== entry.item.source) return false;
    if (filters.topic && !itemTopics.includes(filters.topic)) return false;
    if (filters.myTopics && selectedTopics.length && !itemTopics.some((topic) => selectedTopics.includes(topic))) return false;
    if (filters.savedOnly && !reading[entry.item.url]?.saved) return false;
    if (filters.unreadOnly && reading[entry.item.url]?.read) return false;
    return true;
  }), [deferredQuery, entries, filters, reading, selectedTopics]);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, IndexedEntry[]>();
    for (const entry of results) groups.set(entry.issueDate, [...(groups.get(entry.issueDate) ?? []), entry]);
    return [...groups.entries()];
  }, [results]);

  const update = <Key extends keyof Filters>(key: Key, value: Filters[Key]) => {
    replaceFilters({ ...filters, [key]: value });
  };

  const togglePriority = (priority: Priority) => {
    update("priorities", filters.priorities.includes(priority)
      ? filters.priorities.filter((item) => item !== priority)
      : [...filters.priorities, priority]);
  };

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(defaultFilters);

  return (
    <div className="archive-explorer">
      <div className="archive-toolbar" aria-label="Поиск и фильтры архива">
        <label className="search-field">
          <Search aria-hidden="true" size={19} />
          <span className="sr-only">Поиск по архиву</span>
          <input
            type="search"
            placeholder="Поиск по архиву"
            value={filters.query}
            onChange={(event) => update("query", event.target.value)}
          />
        </label>

        <div className="filter-row">
          <div className="priority-filter" aria-label="Фильтр по приоритету">
            {(["P0", "P1", "P2", "P3"] as Priority[]).map((priority) => (
              <button
                className={filters.priorities.includes(priority) ? `is-selected priority-filter--${priority}` : ""}
                type="button"
                aria-pressed={filters.priorities.includes(priority)}
                onClick={() => togglePriority(priority)}
                key={priority}
              >{priority}</button>
            ))}
          </div>

          <label className="select-control">
            <span>Источник</span>
            <select value={filters.source} onChange={(event) => update("source", event.target.value)}>
              <option value="">Все источники</option>
              {sources.map((source) => <option value={source} key={source}>{source}</option>)}
            </select>
          </label>

          <label className="select-control">
            <span>Тема</span>
            <select value={filters.topic} onChange={(event) => update("topic", event.target.value as TopicId | "")}>
              <option value="">Все темы</option>
              {topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.label}</option>)}
            </select>
          </label>

          <button className={`filter-toggle${filters.savedOnly ? " is-selected" : ""}`} type="button" aria-pressed={filters.savedOnly} onClick={() => update("savedOnly", !filters.savedOnly)}>
            <Bookmark aria-hidden="true" size={17} /> Сохранённые
          </button>
          <button className={`filter-toggle${filters.unreadOnly ? " is-selected" : ""}`} type="button" aria-pressed={filters.unreadOnly} onClick={() => update("unreadOnly", !filters.unreadOnly)}>
            <Check aria-hidden="true" size={18} /> Непрочитанные
          </button>
        </div>

        <details className="topic-settings">
          <summary><SlidersHorizontal aria-hidden="true" size={17} /> Мои темы</summary>
          <div className="topic-settings__body">
            <div className="topic-options">
              {topics.map((topic) => (
                <label key={topic.id}>
                  <input type="checkbox" checked={selectedTopics.includes(topic.id)} onChange={() => toggleTopic(topic.id)} />
                  <span>{topic.label}</span>
                </label>
              ))}
            </div>
            <button
              className={`filter-toggle${filters.myTopics ? " is-selected" : ""}`}
              type="button"
              disabled={!hydrated || selectedTopics.length === 0}
              aria-pressed={filters.myTopics}
              onClick={() => update("myTopics", !filters.myTopics)}
            >
              {filters.myTopics ? "Показываются мои темы" : "Применить мои темы"}
            </button>
          </div>
        </details>
      </div>

      <div className="archive-results__summary" aria-live="polite">
        <span>Найдено материалов: <strong>{results.length}</strong></span>
        {hasFilters ? (
          <button type="button" onClick={() => replaceFilters(defaultFilters)}>
            <RotateCcw aria-hidden="true" size={16} /> Сбросить фильтры
          </button>
        ) : null}
      </div>

      {groupedResults.length > 0 ? groupedResults.map(([date, dateEntries]) => (
        <section className="archive-result-group" key={date}>
          <div className="archive-result-group__head">
            <h2><a href={archivePath(date)}>{formatIssueDate(date)}</a></h2>
            <span>{formatMaterialCount(dateEntries.length)}</span>
          </div>
          <div className="archive-result-list">
            {dateEntries.map((entry) => <ArchiveResult entry={entry} key={`${date}:${entry.item.url}`} />)}
          </div>
        </section>
      )) : (
        <div className="archive-empty">
          <Search aria-hidden="true" size={26} />
          <h2>Ничего не найдено</h2>
          <p>Попробуйте убрать часть фильтров или изменить поисковый запрос.</p>
          <button type="button" onClick={() => replaceFilters(defaultFilters)}>Показать весь архив</button>
        </div>
      )}
    </div>
  );
}
