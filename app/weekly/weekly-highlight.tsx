"use client";

import { Bookmark, Check, ExternalLink } from "lucide-react";
import type { WeeklyMaterial } from "@/lib/weekly";
import { archivePath } from "@/lib/site";
import { formatPublishedAt, itemAnchor, priorityLabels } from "@/lib/digest";
import { useReadingState } from "../reading-state";

export function WeeklyHighlight({ material }: { material: WeeklyMaterial }) {
  const { item, issueDate } = material;
  const { hydrated, reading, toggleRead, toggleSaved } = useReadingState();
  const state = reading[item.url];
  const isRead = hydrated && Boolean(state?.read);
  const isSaved = hydrated && Boolean(state?.saved);

  return (
    <article className={`weekly-highlight${isRead ? " weekly-highlight--read" : ""}`}>
      <div className="weekly-highlight__priority">
        <span className={`priority priority--${item.priority}`}>{item.priority}</span>
      </div>
      <div className="weekly-highlight__content">
        <div className="weekly-highlight__meta">
          <span>{priorityLabels[item.priority]}</span>
          <span>{item.source}</span>
          <time dateTime={item.publishedAt}>{formatPublishedAt(item.publishedAt)}</time>
        </div>
        <h3><a href={`${archivePath(issueDate)}#${itemAnchor(item.url)}`}>{item.title}</a></h3>
        <div className="weekly-highlight__insight">
          <p><span>Почему важно</span>{item.whyImportant}</p>
          <p><span>Что сделать</span>{item.nextStep}</p>
        </div>
        <div className="tag-row" aria-label="Темы материала">
          {item.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </div>
      <div className="weekly-highlight__actions">
        <button
          className={`icon-button${isSaved ? " is-active" : ""}`}
          type="button"
          aria-label={isSaved ? "Убрать из сохранённых" : "Сохранить материал"}
          aria-pressed={isSaved}
          title={isSaved ? "Убрать из сохранённых" : "Сохранить"}
          onClick={() => toggleSaved(item.url)}
        >
          <Bookmark aria-hidden="true" size={17} fill={isSaved ? "currentColor" : "none"} />
        </button>
        <button
          className={`icon-button${isRead ? " is-active" : ""}`}
          type="button"
          aria-label={isRead ? "Отметить непрочитанным" : "Отметить прочитанным"}
          aria-pressed={isRead}
          title={isRead ? "Отметить непрочитанным" : "Отметить прочитанным"}
          onClick={() => toggleRead(item.url)}
        >
          <Check aria-hidden="true" size={18} />
        </button>
        <a className="icon-button" href={item.url} target="_blank" rel="noreferrer" aria-label="Открыть оригинал" title="Открыть оригинал">
          <ExternalLink aria-hidden="true" size={17} />
        </a>
      </div>
    </article>
  );
}
