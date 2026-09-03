"use client";

import { AlertTriangle, ArrowRight, Check, ExternalLink, FolderCog, GitCompareArrows, LoaderCircle, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ArchiveCatalog, Priority } from "@/lib/digest";
import { buildCompatibilityReport } from "@/lib/compatibility";
import type { PackageCatalogV1 } from "@/lib/package-catalog";
import { packageGroupForName } from "@/lib/package-catalog";
import { allCatalogItems, isRecommendedAction, relevanceForItem } from "@/lib/project";
import { comparePath, packageCatalogPath, projectPath } from "@/lib/site";
import { useReadingState } from "./reading-state";

const priorityRank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function PersonalRadar({ catalog: archive }: { catalog: ArchiveCatalog }) {
  const { project } = useReadingState();
  const [catalog, setCatalog] = useState<PackageCatalogV1 | null>(null);
  const [loadError, setLoadError] = useState(false);
  const latestDate = archive.issues[0]?.date ?? "1970-01-01";

  useEffect(() => {
    if (!project?.packages.length || catalog || loadError) return;
    let active = true;
    fetch(packageCatalogPath())
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<PackageCatalogV1>;
      })
      .then((value) => active && setCatalog(value))
      .catch(() => active && setLoadError(true));
    return () => { active = false; };
  }, [catalog, loadError, project?.packages.length]);

  const relevantNews = useMemo(() => {
    if (!project) return [];
    const boundary = Date.parse(`${latestDate}T12:00:00Z`) - 6 * 86400000;
    return allCatalogItems(archive)
      .filter(({ item, issueDate }) => Date.parse(`${issueDate}T12:00:00Z`) >= boundary && relevanceForItem(item, project).level !== "none")
      .sort((left, right) => priorityRank[left.item.priority] - priorityRank[right.item.priority] || right.issueDate.localeCompare(left.issueDate));
  }, [archive, latestDate, project]);
  const report = useMemo(() => catalog ? buildCompatibilityReport(project, catalog) : null, [catalog, project]);

  if (!project) {
    return (
      <section className="personal-radar personal-radar--empty">
        <FolderCog aria-hidden="true" size={25} />
        <div><span>Мой радар</span><strong>Новости и обновления именно для вашего стека</strong><p>Импортируйте package.json и lock-файл. Проверка выполняется локально.</p></div>
        <a href={projectPath()}>Открыть React Stack Check <ArrowRight aria-hidden="true" size={17} /></a>
      </section>
    );
  }

  const attention = report?.signals.filter(({ status }) => ["conflict", "prerequisite", "update"].includes(status)) ?? [];
  const conflicts = report?.signals.filter(({ status }) => status === "conflict").length ?? 0;
  const updates = report?.signals.filter(({ status }) => status === "update").length ?? 0;
  const recommendedNews = relevantNews.filter(({ item, issueDate }) => isRecommendedAction(item, issueDate, latestDate, project)).length;

  return (
    <section className="personal-radar">
      <div className="personal-radar__head">
        <div><span>Мой радар · {project.name}</span><strong>{conflicts ? "Есть конфликт совместимости" : attention.length ? "Стек требует внимания" : "Стек выглядит спокойно"}</strong><p>{recommendedNews ? `Новых действий из выпусков: ${recommendedNews}.` : "Срочных действий из выпусков недели нет."}</p></div>
        <a href={projectPath()}>Открыть Stack Check <ArrowRight aria-hidden="true" size={17} /></a>
      </div>

      <div className="personal-radar__metrics">
        <div><span>Пакеты</span><strong>{project.packages.length}</strong></div>
        <div><span>Обновить</span><strong>{updates}</strong></div>
        <div><span>Конфликты</span><strong>{conflicts}</strong></div>
        <div><span>Совпадения за 7 дней</span><strong>{relevantNews.length}</strong></div>
      </div>

      <div className="personal-radar__body">
        <div className="personal-radar__actions">
          <div className="personal-radar__section-title"><span>Ближайшие действия</span>{!catalog && !loadError ? <LoaderCircle className="spin" aria-label="Загружается" size={17} /> : null}</div>
          {loadError ? <p className="personal-radar__message"><AlertTriangle aria-hidden="true" size={16} /> Каталог версий временно недоступен.</p> : null}
          {attention.slice(0, 3).map((signal) => {
            const group = packageGroupForName(signal.package.name);
            const compareHref = group && signal.currentVersion && signal.targetVersion ? comparePath({ slug: group.slug, from: signal.currentVersion, to: signal.targetVersion }) : projectPath();
            return <a href={compareHref} key={signal.package.name}><span className={`personal-radar__signal personal-radar__signal--${signal.status}`}>{signal.status === "update" ? <Wrench aria-hidden="true" size={15} /> : <AlertTriangle aria-hidden="true" size={15} />}{signal.status === "update" ? "Обновить" : signal.status === "conflict" ? "Конфликт" : "Нужен шаг"}</span><div><strong>{signal.label}</strong><p>{signal.reason}</p></div><GitCompareArrows aria-hidden="true" size={17} /></a>;
          })}
          {report && !attention.length ? <p className="personal-radar__message"><Check aria-hidden="true" size={16} /> Совместимых обязательных обновлений нет.</p> : null}
        </div>

        <div className="personal-radar__news">
          <div className="personal-radar__section-title"><span>По вашему стеку</span><small>7 дней</small></div>
          {relevantNews.slice(0, 3).map(({ item }) => <a href={item.url} target="_blank" rel="noopener noreferrer" key={item.url}><span>{item.priority} · {item.source}</span><strong>{item.title}</strong><ExternalLink aria-hidden="true" size={15} /></a>)}
          {!relevantNews.length ? <p className="personal-radar__message"><Check aria-hidden="true" size={16} /> Новых материалов для выбранного стека нет.</p> : null}
        </div>
      </div>
    </section>
  );
}
