import type { Metadata } from "next";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Minus, RadioTower } from "lucide-react";
import catalogData from "@/data/archive/catalog.json";
import type { ArchiveCatalog, Priority } from "@/lib/digest";
import { formatIssueDate, formatMaterialCount } from "@/lib/digest";
import { archivePath, sitePath, weeklyPath } from "@/lib/site";
import { buildWeeklyComparison, formatWeeklyRange, weeklySummary } from "@/lib/weekly";
import { SiteHeader } from "../site-header";
import { WeeklyHighlight } from "./weekly-highlight";

const catalog = catalogData as ArchiveCatalog;
const comparison = buildWeeklyComparison(catalog);
const weekly = comparison.current;
const range = formatWeeklyRange(weekly.startDate, weekly.endDate);
const priorities: Priority[] = ["P0", "P1", "P2", "P3"];

function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="weekly-delta weekly-delta--flat"><Minus aria-hidden="true" size={15} /> нет данных</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return <span className={`weekly-delta weekly-delta--${value > 0 ? "up" : value < 0 ? "down" : "flat"}`}><Icon aria-hidden="true" size={15} />{value > 0 ? "+" : ""}{value}{suffix}</span>;
}

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

      <section className="section weekly-comparison" aria-labelledby="weekly-comparison-title">
        <div className="weekly-comparison__head">
          <div><p className="eyebrow">Изменение сигнала</p><h2 id="weekly-comparison-title">По сравнению с прошлой неделей</h2></div>
          <span>{formatWeeklyRange(comparison.previous.startDate, comparison.previous.endDate)}</span>
        </div>
        {comparison.hasBaseline ? (
          <>
            <div className="weekly-comparison__metrics">
              <div><span>Материалы</span><strong>{weekly.materials.length}</strong><Delta value={comparison.deltas.materials} /></div>
              <div><span>P0–P1</span><strong>{weekly.importantCount}</strong><Delta value={comparison.deltas.important} /></div>
              <div><span>Активные дни</span><strong>{weekly.activeDays}</strong><Delta value={comparison.deltas.activeDays} /></div>
              <div><span>Доступность</span><strong>{healthPercent === null ? "н/д" : `${healthPercent}%`}</strong><Delta value={comparison.deltas.sourceHealthPoints} suffix=" п.п." /></div>
            </div>
            <div className="weekly-comparison__topics">
              <h3>Как сдвинулись темы</h3>
              {comparison.topicChanges.length ? comparison.topicChanges.slice(0, 6).map((topic) => (
                <a href={`${archivePath()}?topic=${topic.id}`} className={`topic-shift topic-shift--${topic.direction}`} key={topic.id}>
                  <span>{topic.label}</span><small>{topic.direction === "new" ? "Новая тема" : topic.direction === "rising" ? "Стало больше" : "Стало тише"}</small><strong>{topic.previous} → {topic.current}</strong>
                </a>
              )) : <p>Распределение тем не изменилось.</p>}
            </div>
          </>
        ) : (
          <div className="weekly-comparison__empty"><Minus aria-hidden="true" size={21} /><div><strong>Пока недостаточно данных</strong><p>Для честного сравнения нужно хотя бы три выпуска в предыдущем семидневном окне. Секция заполнится автоматически.</p></div></div>
        )}
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
