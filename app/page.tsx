import digestData from "@/data/digest.json";
import catalogData from "@/data/archive/catalog.json";
import { ArrowRight, CalendarRange, ExternalLink } from "lucide-react";
import { DigestCard } from "./digest-card";
import { ReadingSummary } from "./reading-summary";
import { ProjectPulse } from "./project-pulse";
import { SourceHealthPanel } from "./source-health";
import type { ArchiveCatalog, Digest, Priority } from "@/lib/digest";
import { formatIssueDate } from "@/lib/digest";
import { archivePath, packagesPath, projectPath, sitePath, weeklyPath } from "@/lib/site";
import { buildWeeklyDigest, formatWeeklyRange } from "@/lib/weekly";

type SourceGroup = {
  priority: Priority;
  label: string;
  sources: string[];
};

const digest = digestData as Digest;
const catalog = catalogData as ArchiveCatalog;
const weekly = buildWeeklyDigest(catalog);
const knownUrls = [...new Set(catalog.issues.flatMap((issue) => [...issue.items, ...issue.readLater].map(({ url }) => url)))];
const weeklyUrls = weekly.materials.map(({ item }) => item.url);

const sourceGroups: SourceGroup[] = [
  {
    priority: "P0",
    label: "Срочно",
    sources: ["React Security", "Next.js Advisories"],
  },
  {
    priority: "P1",
    label: "Первоисточники",
    sources: ["React", "Next.js", "TypeScript", "typescript-go", "Vite"],
  },
  {
    priority: "P2",
    label: "Экосистема",
    sources: ["React Router", "Redux Toolkit", "TanStack Query", "Storybook", "ESLint", "Prettier"],
  },
  {
    priority: "P3",
    label: "Контекст",
    sources: ["MDN", "web.dev", "TC39", "React Status", "This Week in React", "Frontend Focus", "JavaScript Weekly", "Веб-стандарты"],
  },
];

export default function Home() {
  const issueDate = formatIssueDate(digest.date);
  const importantCount = digest.items.filter(
    ({ priority }) => priority === "P0" || priority === "P1",
  ).length;

  return (
    <main id="top">
      <header
        className="hero"
        style={{
          backgroundImage: `linear-gradient(102deg, rgba(8, 18, 17, 0.98) 0%, rgba(8, 40, 37, 0.9) 48%, rgba(8, 20, 19, 0.46) 100%), url("${sitePath("/frontend-radar-hero-v2.jpg")}")`,
        }}
      >
        <div className="hero__inner">
          <nav className="topbar" aria-label="Основная навигация">
            <a className="brand" href="#top" aria-label="Frontend Radar, наверх">
              <span className="brand__mark">FR</span>
              <span>Frontend Radar</span>
            </a>
            <div className="topbar__links">
              <a href="#today">Сегодня</a>
              <a href={weeklyPath()}>Неделя</a>
              <a href={archivePath()}>Архив</a>
              <a href={packagesPath()}>Пакеты</a>
              <a href={projectPath()}>Мой проект</a>
            </div>
          </nav>

          <div className="hero__grid">
            <div className="hero__copy">
              <p className="eyebrow">Выпуск за {issueDate}</p>
              <h1>Frontend Radar</h1>
              <p className="hero__lead">
                Короткая русская подборка по React и фронтенду: сначала безопасность,
                релизы и ломающие изменения, затем инструменты и спокойное чтение.
              </p>
              <div className="hero__actions">
                <a className="button button--primary" href="#today">Читать выпуск</a>
                <a className="button" href={weeklyPath()}><CalendarRange aria-hidden="true" size={18} /> Итоги недели</a>
              </div>
            </div>

            <aside className="issue-panel" aria-label="Статус сегодняшнего выпуска">
              <div className="issue-panel__status">
                <span className={`status-dot status-dot--${digest.status}`} aria-hidden="true" />
                <span>{digest.status === "quiet" ? "Спокойное утро" : "Есть важные события"}</span>
              </div>
              <strong>08:00</strong>
              <span className="issue-panel__timezone">по московскому времени</span>
              <p>{digest.summary}</p>
              <div className="issue-panel__meter" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </aside>
          </div>
        </div>
      </header>

      <section className="metrics" aria-label="Сводка выпуска">
        <div className="metric">
          <span>Источники</span>
          <strong>{digest.sourceHealth?.succeeded ?? digest.sourcesChecked}/{digest.sourceHealth?.attempted ?? 21}</strong>
          <small>ответили при сборе</small>
        </div>
        <div className="metric">
          <span>Требуют внимания</span>
          <strong>{importantCount}</strong>
          <small>пунктов P0–P1</small>
        </div>
        <div className="metric">
          <span>Отложено</span>
          <strong>{digest.readLater.length}</strong>
          <small>материала с конспектом</small>
        </div>
        <div className="metric">
          <span>Окно сбора</span>
          <strong>{digest.windowHours}ч</strong>
          <small>до утреннего выпуска</small>
        </div>
      </section>

      <div className="section section--health">
        <SourceHealthPanel digest={digest} />
      </div>

      <div className="section section--reading">
        <ReadingSummary knownUrls={knownUrls} weeklyUrls={weeklyUrls} />
      </div>

      <div className="section section--project-pulse">
        <ProjectPulse catalog={catalog} />
      </div>

      <section className="section" id="today">
        <div className="section__head section__head--row">
          <div>
            <p className="eyebrow">Сегодня</p>
            <h2>Что требует внимания</h2>
          </div>
          <time className="issue-date" dateTime={digest.date}>{issueDate}</time>
        </div>

        {digest.items.length > 0 ? (
          <div className="digest-grid">
            {digest.items.map((item) => <DigestCard item={item} key={item.url} />)}
          </div>
        ) : (
          <div className="quiet-state">
            <span className="quiet-state__mark" aria-hidden="true">✓</span>
            <div>
              <h3>Срочных событий нет</h3>
              <p>{digest.summary}</p>
            </div>
          </div>
        )}
      </section>

      <section className="weekly-preview">
        <div className="section weekly-preview__inner">
          <div className="weekly-preview__intro">
            <p className="eyebrow">{formatWeeklyRange(weekly.startDate, weekly.endDate)}</p>
            <h2>Неделя в одном экране</h2>
            <p>Главные события без повторов, пульс приоритетов и темы, которые чаще всего появлялись в выпусках.</p>
            <dl className="weekly-preview__stats">
              <div><dt>Материалов</dt><dd>{weekly.materials.length}</dd></div>
              <div><dt>P0–P1</dt><dd>{weekly.importantCount}</dd></div>
              <div><dt>Активных дней</dt><dd>{weekly.activeDays}</dd></div>
            </dl>
            <a className="button button--ink" href={weeklyPath()}>Открыть итоги недели <ArrowRight aria-hidden="true" size={18} /></a>
          </div>
          <div className="weekly-preview__list">
            {weekly.highlights.slice(0, 3).map(({ item }, index) => (
              <a href={item.url} target="_blank" rel="noopener noreferrer" key={item.url}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><small>{item.priority} · {item.source}</small><strong>{item.title}</strong></div>
                <ExternalLink aria-hidden="true" size={17} />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="section read-later-section" id="read-later">
        <div className="section__head">
          <p className="eyebrow">Read later</p>
          <h2>Полезное на потом</h2>
          <p>Переведённые конспекты материалов, которые не требуют немедленной реакции.</p>
        </div>
        <div className="digest-grid">
          {digest.readLater.map((item) => <DigestCard item={item} key={item.url} />)}
        </div>
      </section>

      <section className="section sources-section" id="sources">
        <div className="section__head">
          <p className="eyebrow">Карта источников</p>
          <h2>{digest.sourcesChecked} каналов без общей свалки</h2>
          <p>Каждая группа получает свой вес: первоисточник всегда выше пересказа.</p>
        </div>
        <div className="source-groups">
          {sourceGroups.map((group) => (
            <article className={`source-group source-group--${group.priority}`} key={group.priority}>
              <div className="source-group__head">
                <span className={`priority priority--${group.priority}`}>{group.priority}</span>
                <h3>{group.label}</h3>
              </div>
              <div className="source-list">
                {group.sources.map((source) => <span key={source}>{source}</span>)}
              </div>
            </article>
          ))}
        </div>
      </section>

    </main>
  );
}
