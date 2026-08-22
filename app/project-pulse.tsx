"use client";

import { ArrowRight, ExternalLink, FolderCog } from "lucide-react";
import { useMemo } from "react";
import type { ArchiveCatalog, Priority } from "@/lib/digest";
import { allCatalogItems, isRecommendedAction, relevanceForItem } from "@/lib/project";
import { projectPath } from "@/lib/site";
import { useReadingState } from "./reading-state";

const rank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function ProjectPulse({ catalog }: { catalog: ArchiveCatalog }) {
  const { project } = useReadingState();
  const latestDate = catalog.issues[0]?.date ?? "1970-01-01";
  const entries = useMemo(() => {
    if (!project) return [];
    const boundary = Date.parse(`${latestDate}T12:00:00Z`) - 6 * 86400000;
    return allCatalogItems(catalog)
      .filter(({ item, issueDate }) => Date.parse(`${issueDate}T12:00:00Z`) >= boundary && relevanceForItem(item, project).level !== "none")
      .sort((left, right) => rank[left.item.priority] - rank[right.item.priority] || right.issueDate.localeCompare(left.issueDate));
  }, [catalog, latestDate, project]);

  if (!project) {
    return (
      <section className="project-pulse project-pulse--empty">
        <FolderCog aria-hidden="true" size={24} />
        <div><span>React Stack Check</span><strong>Проверить совместимость проекта</strong><p>Добавьте package.json и lock-файл: версии останутся в браузере.</p></div>
        <a href={projectPath()}>Проверить проект <ArrowRight aria-hidden="true" size={17} /></a>
      </section>
    );
  }

  const recommendedCount = entries.filter(({ item, issueDate }) => isRecommendedAction(item, issueDate, latestDate, project)).length;
  return (
    <section className="project-pulse">
      <div className="project-pulse__summary"><span>Для «{project.name}» за 7 дней</span><strong>{entries.length} совпадений</strong><p>{recommendedCount ? `Требуют внимания: ${recommendedCount}.` : "Срочных действий по вашему стеку нет."}</p><a href={projectPath()}>Открыть Stack Check <ArrowRight aria-hidden="true" size={17} /></a></div>
      <div className="project-pulse__list">
        {entries.slice(0, 3).map(({ item }) => <a href={item.url} target="_blank" rel="noopener noreferrer" key={item.url}><span>{item.priority} · {item.source}</span><strong>{item.title}<ExternalLink aria-hidden="true" size={14} /></strong></a>)}
        {!entries.length ? <p>В выпусках этой недели совпадений не найдено. Полная лента остаётся ниже.</p> : null}
      </div>
    </section>
  );
}
