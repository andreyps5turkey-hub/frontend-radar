"use client";

import { Bookmark, Check, ExternalLink, ListPlus } from "lucide-react";
import type { DigestItem } from "@/lib/digest";
import { formatPublishedAt, itemAnchor, priorityLabels } from "@/lib/digest";
import { useReadingState } from "./reading-state";
import { relevanceForItem } from "@/lib/project";
import { ItemSignals } from "./item-signals";

export function DigestCard({ item }: { item: DigestItem }) {
  const { hydrated, reading, toggleRead, toggleSaved, project, actions, setActionStatus } = useReadingState();
  const itemState = reading[item.url];
  const isRead = hydrated && Boolean(itemState?.read);
  const isSaved = hydrated && Boolean(itemState?.saved);
  const actionStatus = hydrated ? actions[item.url]?.status : undefined;
  const isPlanned = actionStatus === "planned";
  const relevance = relevanceForItem(item, project);

  return (
    <article className={`digest-card digest-card--${item.priority}${isRead ? " digest-card--read" : ""}`} id={itemAnchor(item.url)}>
      <div className="digest-card__meta">
        <span className={`priority priority--${item.priority}`}>
          {item.priority} · {priorityLabels[item.priority]}
        </span>
        <span>{item.source}</span>
        <time dateTime={item.publishedAt}>{formatPublishedAt(item.publishedAt)}</time>
      </div>
      <h3>
        <a className="article-title-link" href={item.url} target="_blank" rel="noopener noreferrer">
          {item.title}<ExternalLink aria-hidden="true" size={15} />
        </a>
      </h3>
      <ItemSignals item={item} relevance={relevance} />
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
          {item.actionItems?.length ? <ul className="action-items">{item.actionItems.map((action) => <li key={action}>{action}</li>)}</ul> : null}
        </div>
      </div>
      <div className="digest-card__footer">
        <div className="tag-row" aria-label="Темы материала">
          {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="card-actions">
          <button
            className={`icon-button${isPlanned ? " is-active" : ""}`}
            type="button"
            aria-label={isPlanned ? "Убрать из плана" : actionStatus === "done" ? "Вернуть в план" : "Добавить в план"}
            aria-pressed={isPlanned}
            title={isPlanned ? "Убрать из плана" : actionStatus === "done" ? "Вернуть в план" : "Добавить в план"}
            onClick={() => setActionStatus(item.url, isPlanned ? null : "planned")}
          >
            <ListPlus aria-hidden="true" size={18} />
          </button>
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
          <a className="text-link" href={item.url} target="_blank" rel="noopener noreferrer">
            Читать оригинал <ExternalLink aria-hidden="true" size={15} />
          </a>
        </div>
      </div>
    </article>
  );
}
