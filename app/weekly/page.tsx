import type { Metadata } from "next";
import { ArrowRight, CalendarDays, RadioTower } from "lucide-react";
import catalogData from "@/data/archive/catalog.json";
import type { ArchiveCatalog, Priority } from "@/lib/digest";
import { formatIssueDate, formatMaterialCount } from "@/lib/digest";
import { archivePath, sitePath, weeklyPath } from "@/lib/site";
import { buildWeeklyDigest, formatWeeklyRange, weeklySummary } from "@/lib/weekly";
import { SiteHeader } from "../site-header";
import { WeeklyHighlight } from "./weekly-highlight";

const catalog = catalogData as ArchiveCatalog;
const weekly = buildWeeklyDigest(catalog);
const range = formatWeeklyRange(weekly.startDate, weekly.endDate);
const priorities: Priority[] = ["P0", "P1", "P2", "P3"];

export const metadata: Metadata = {
  title: "Неделя во фронтенде | Frontend Radar",
  description: `Главные события React и фронтенда за ${range}: приоритеты, темы и практические следующие шаги.`,
  alternates: { canonical: weeklyPath() },
};

export default function WeeklyPage() {
  const healthPercent = weekly.sourceHealth.attempted
    ? Math.round((weekly.sourceHealth.succeeded / weekly.sourceHealth.attempted) * 100)
    : null;

  return (
    <main>
      <SiteHeader />
      <header className="weekly-header">
        <div className="weekly-header__inner">
          <div>
            <span className="weekly-header__date"><CalendarDays aria-hidden="true" size={18} /> {range}</span>
            <h1>Неделя во фронтенде</h1>
            <p>{weeklySummary(weekly)}</p>
          </div>
          <div className="weekly-header__signal">
            <RadioTower aria-hidden="true" size={21} />
            <span>Главный сигнал</span>
            <strong>{weekly.highlights[0]?.item.title ?? "Значимых событий не было"}</strong>
          </div>
        </div>
      </header>

      <section className="weekly-metrics" aria-label="Сводка за неделю">
        <div><span>Выпусков</span><strong>{weekly.issues.length}</strong><small>из 7 возможных дней</small></div>
        <div><span>Без повторов</span><strong>{weekly.materials.length}</strong><small>{formatMaterialCount(weekly.materials.length)}</small></div>
        <div><span>Требуют внимания</span><strong>{weekly.importantCount}</strong><small>материалов P0–P1</small></div>
        <div><span>Доступность источников</span><strong>{healthPercent === null ? "н/д" : `${healthPercent}%`}</strong><small>по выпускам с диагностикой</small></div>
      </section>

      <div className="section weekly-main">
        <section className="weekly-highlights">
          <div className="section__head">
            <p className="eyebrow">Главное</p>
            <h2>Что не стоит пропустить</h2>
            <p>Материалы отсортированы по редакционному приоритету, затем по свежести.</p>
          </div>
          <div className="weekly-highlight-list">
            {weekly.highlights.map((material) => <WeeklyHighlight material={material} key={material.item.url} />)}
          </div>
        </section>

        <aside className="weekly-sidebar" aria-label="Пульс недели">
          <section className="weekly-pulse">
            <h2>Пульс приоритетов</h2>
            <div className="weekly-pulse__rows">
              {priorities.map((priority) => (
                <div key={priority}>
                  <span className={`priority priority--${priority}`}>{priority}</span>
                  <span className="weekly-pulse__track">
                    <i style={{ width: `${weekly.priorityCounts[priority] && weekly.materials.length ? Math.max(8, weekly.priorityCounts[priority] / weekly.materials.length * 100) : 0}%` }} />
                  </span>
                  <strong>{weekly.priorityCounts[priority]}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="weekly-topics">
            <h2>Темы недели</h2>
            {weekly.topics.length ? (
              <div>
                {weekly.topics.map((topic) => (
                  <a href={`${archivePath()}?topic=${topic.id}`} key={topic.id}>
                    <span>{topic.label}</span><strong>{topic.count}</strong>
                  </a>
                ))}
              </div>
            ) : <p>Тематические сигналы появятся по мере накопления выпусков.</p>}
          </section>

          <section className="weekly-health">
            <h2>Качество данных</h2>
            <p>
              Подробная диагностика есть у {weekly.sourceHealth.detailedIssues} из {weekly.issues.length} выпусков.
              {weekly.sourceHealth.legacyIssues ? " Более ранние выпуски учитываются без детального статуса каналов." : " Все дни содержат детальный статус источников."}
            </p>
          </section>
        </aside>
      </div>

      <section className="section weekly-timeline">
        <div className="section__head">
          <p className="eyebrow">По дням</p>
          <h2>Как развивалась неделя</h2>
        </div>
        <div className="weekly-timeline__list">
          {weekly.issues.map((issue) => (
            <a href={archivePath(issue.date)} key={issue.date}>
              <time dateTime={issue.date}>{formatIssueDate(issue.date)}</time>
              <span className={`status-dot status-dot--${issue.status}`} aria-hidden="true" />
              <span>{issue.summary}</span>
              <strong>{issue.items.length + issue.readLater.length}</strong>
              <ArrowRight aria-hidden="true" size={18} />
            </a>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div><strong>Frontend Radar</strong><span>Ежедневная выжимка и недельный контекст на русском языке.</span></div>
        <a href={sitePath("/feed.xml")}>RSS выпуска</a>
      </footer>
    </main>
  );
}
