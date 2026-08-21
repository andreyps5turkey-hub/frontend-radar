import digestData from "@/data/digest.json";

type Priority = "P0" | "P1" | "P2" | "P3";

type DigestItem = {
  priority: Priority;
  title: string;
  source: string;
  publishedAt: string;
  whyImportant: string;
  audience: string;
  nextStep: string;
  url: string;
  tags: string[];
};

type SourceGroup = {
  priority: Priority;
  label: string;
  sources: string[];
};

const digest = digestData as {
  date: string;
  generatedAt: string;
  timezone: string;
  windowHours: number;
  status: "active" | "quiet";
  summary: string;
  items: DigestItem[];
  readLater: DigestItem[];
  sourcesChecked: number;
};

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

const priorityLabels: Record<Priority, string> = {
  P0: "Срочно",
  P1: "Важно",
  P2: "Инструменты",
  P3: "На потом",
};

function formatIssueDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(`${value}T12:00:00+03:00`));
}

function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function DigestCard({ item }: { item: DigestItem }) {
  return (
    <article className={`digest-card digest-card--${item.priority}`}>
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
          {item.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <a className="text-link" href={item.url} target="_blank" rel="noreferrer">
          Читать оригинал <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

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
                <a className="button" href="#automation">Как обновляется</a>
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
          <span>Проверено</span>
          <strong>{digest.sourcesChecked}</strong>
          <small>официальных источников</small>
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
      </footer>
    </main>
  );
}
