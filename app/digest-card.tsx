"use client";

import { Bookmark, Check, ExternalLink } from "lucide-react";
import type { DigestItem } from "@/lib/digest";
import { formatPublishedAt, itemAnchor, priorityLabels } from "@/lib/digest";
import { useReadingState } from "./reading-state";

export function DigestCard({ item }: { item: DigestItem }) {
  const { hydrated, reading, toggleRead, toggleSaved } = useReadingState();
  const itemState = reading[item.url];
  const isRead = hydrated && Boolean(itemState?.read);
  const isSaved = hydrated && Boolean(itemState?.saved);

  return (
    <article className={`digest-card digest-card--${item.priority}${isRead ? " digest-card--read" : ""}`} id={itemAnchor(item.url)}>
      <div className="digest-card__meta">
        <span className={`priority priority--${item.priority}`}>
          {item.priority} · {priorityLabels[item.priority]}
        </span>
        <span>{item.source}</span>
        <time dateTime={item.publishedAt}>{formatPublishedAt(item.publishedAt)}</time>
      </div>
      <h3>{item.title}</h3>
      <div className="digest-card__body">
        <div>
          <span className="field-label">Почему важно</span>
          <p>{item.whyImportant}</p>
        </div>
        <div>
          <span className="field-label">Кого затронет</span>
          <p>{item.audience}</p>
        </div>
        <div className="next-step">
          <span className="field-label">Следующий шаг</span>
          <p>{item.nextStep}</p>
        </div>
      </div>
      <div className="digest-card__footer">
        <div className="tag-row" aria-label="Темы материала">
          {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="card-actions">
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
          <a className="text-link" href={item.url} target="_blank" rel="noreferrer">
            Читать оригинал <ExternalLink aria-hidden="true" size={15} />
          </a>
        </div>
      </div>
    </article>
  );
}
