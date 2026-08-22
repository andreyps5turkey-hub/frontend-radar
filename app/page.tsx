import digestData from "@/data/digest.json";
import { Archive, Rss } from "lucide-react";
import { DigestCard } from "./digest-card";
import { SourceHealthPanel } from "./source-health";
import type { Digest, Priority } from "@/lib/digest";
import { formatIssueDate } from "@/lib/digest";
import { archivePath, sitePath } from "@/lib/site";

type SourceGroup = {
  priority: Priority;
  label: string;
  sources: string[];
};

const digest = digestData as Digest;

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
      <header className="hero">
        <div className="hero__inner">
          <nav className="topbar" aria-label="Основная навигация">
            <a className="brand" href="#top" aria-label="Frontend Radar, наверх">
              <span className="brand__mark">FR</span>
              <span>Frontend Radar</span>
            </a>
            <div className="topbar__links">
              <a href="#today">Сегодня</a>
              <a href="#read-later">На потом</a>
              <a href={archivePath()}>Архив</a>
              <a href="#sources">Источники</a>
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
                <a className="button" href={archivePath()}><Archive aria-hidden="true" size={18} /> Архив выпусков</a>
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

      <section className="automation-band" id="automation">
        <div className="section automation-grid">
          <div>
            <p className="eyebrow">Автоматизация</p>
            <h2>Новый выпуск каждый день в 08:00 МСК</h2>
            <p>
              GitHub Actions собирает свежие записи, отбрасывает шум, создаёт русский
              конспект и публикует обновлённую страницу. Предыдущие выпуски сохраняются
              в архиве репозитория.
            </p>
          </div>
          <ol className="workflow">
            <li><strong>05:00 UTC</strong><span>Сбор RSS, Atom и релизов за последние 26 часов</span></li>
            <li><strong>P0–P3</strong><span>Оценка срочности и практической пользы</span></li>
            <li><strong>Русский</strong><span>Перевод заголовка, сути и следующего шага</span></li>
            <li><strong>Публикация</strong><span>Проверка данных, сборка страницы и обновление архива</span></li>
          </ol>
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

      <footer className="footer">
        <div>
          <strong>Frontend Radar</strong>
          <span>Русская выжимка, оригинальные ссылки, никакой полной перепечатки.</span>
        </div>
        <a href="https://github.com/andreyps5turkey-hub/frontend-radar" target="_blank" rel="noreferrer">
          Исходный код на GitHub <span aria-hidden="true">↗</span>
        </a>
        <a className="footer__rss" href={sitePath("/feed.xml")}>
          <Rss aria-hidden="true" size={16} /> RSS выпуска
        </a>
      </footer>
    </main>
  );
}
