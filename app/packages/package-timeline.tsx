"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { PackageEvent, PackageEventKind } from "@/lib/package-catalog";

type TimelineFilter = "all" | PackageEventKind;
const filters: Array<{ id: TimelineFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "security", label: "Безопасность" },
  { id: "major", label: "Major" },
  { id: "minor", label: "Minor" },
  { id: "patch", label: "Patch" },
];

export function PackageTimeline({ events }: { events: PackageEvent[] }) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const filtered = events.filter(({ kind }) => filter === "all" || kind === filter);
  return (
    <section className="package-timeline" aria-labelledby="package-timeline-title">
      <div className="package-section-head"><div><span>Релизный радар</span><h2 id="package-timeline-title">История важных изменений</h2></div><div className="segmented-control" aria-label="Фильтр истории">{filters.map((item) => <button className={filter === item.id ? "is-active" : ""} type="button" onClick={() => setFilter(item.id)} key={item.id}>{item.label}</button>)}</div></div>
      <div className="package-timeline__header"><span>Версия и дата</span><span>Тип</span><span>Практический смысл</span><span>Источник</span></div>
      {filtered.map((event) => (
        <article className={`package-event package-event--${event.kind}`} key={event.id}>
          <div><strong>{event.version ? `v${event.version}` : event.source}</strong><time dateTime={event.publishedAt}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(event.publishedAt))}</time></div>
          <span>{event.kind === "security" ? "Security" : event.kind[0].toUpperCase() + event.kind.slice(1)}</span>
          <div><strong>{event.title}</strong><p>{event.summary}</p></div>
          <a href={event.url} target="_blank" rel="noopener noreferrer" aria-label="Открыть первоисточник" title="Открыть первоисточник"><ExternalLink aria-hidden="true" size={17} /></a>
        </article>
      ))}
      {!filtered.length ? <p className="package-timeline__empty">Для выбранного типа пока нет сохранённых событий.</p> : null}
    </section>
  );
}
