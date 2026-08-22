"use client";

import {
  Check,
  Copy,
  ExternalLink,
  FileJson,
  ListPlus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { ArchiveCatalog, DigestItem, Priority } from "@/lib/digest";
import {
  allCatalogItems,
  createEmptyProject,
  isRecommendedAction,
  packageRegistry,
  parseProjectManifest,
  relevanceForItem,
  technologiesForPackage,
  type ActionStatus,
  type ProjectProfile,
} from "@/lib/project";
import { topics, type TopicId } from "@/lib/topics";
import { formatIssueDate } from "@/lib/digest";
import { useReadingState } from "../reading-state";
import { ItemSignals } from "../item-signals";
import { VersionRadar } from "./version-radar";

const MAX_PACKAGE_FILE_SIZE = 1024 * 1024;
const priorityRank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

type QueueEntry = {
  item: DigestItem;
  issueDate: string;
  status: ActionStatus | "recommended";
};

function updatedProject(project: ProjectProfile | null, changes: Partial<ProjectProfile>): ProjectProfile {
  return { ...(project ?? createEmptyProject()), ...changes, updatedAt: new Date().toISOString() };
}

function ProjectSetup() {
  const { project, saveProject, clearProject } = useReadingState();
  const [message, setMessage] = useState("");
  const [packageName, setPackageName] = useState("");
  const [packageVersion, setPackageVersion] = useState("");

  const importPackageJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_PACKAGE_FILE_SIZE) {
      setMessage("Файл больше 1 МБ. Выберите обычный package.json без вложенных данных.");
      return;
    }
    try {
      const { profile, ignored } = parseProjectManifest(await file.text());
      saveProject(profile);
      setMessage(`Распознано пакетов: ${profile.packages.length}. Не относятся к радару: ${ignored}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось прочитать package.json.");
    }
  };

  const toggleTechnology = (topic: TopicId) => {
    const base = project ?? createEmptyProject();
    const technologies = base.technologies.includes(topic)
      ? base.technologies.filter((entry) => entry !== topic)
      : [...base.technologies, topic];
    saveProject(updatedProject(base, { technologies }));
  };

  const addPackage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = packageName.trim().toLowerCase();
    const version = packageVersion.trim();
    if (!name || !version) return;
    const base = project ?? createEmptyProject();
    const packages = [...base.packages.filter((entry) => entry.name !== name), { name, version, sections: ["manual"] }]
      .sort((left, right) => left.name.localeCompare(right.name));
    const technologies = [...new Set([...base.technologies, ...technologiesForPackage(name)])];
    saveProject(updatedProject(base, { packages, technologies }));
    setPackageName("");
    setPackageVersion("");
  };

  const removePackage = (name: string) => {
    if (!project) return;
    saveProject(updatedProject(project, { packages: project.packages.filter((entry) => entry.name !== name) }));
  };

  return (
    <section className="project-setup" aria-labelledby="project-setup-title">
      <div className="project-setup__intro">
        <p className="eyebrow">Локальный профиль</p>
        <h2 id="project-setup-title">Стек проекта</h2>
        <p>Зависимости сопоставляются с выпусками прямо в браузере. Файл и профиль не отправляются наружу.</p>
        <label className="button button--ink file-button">
          <FileJson aria-hidden="true" size={18} /> Импортировать package.json
          <input type="file" accept="application/json,.json" onChange={importPackageJson} />
        </label>
        {message ? <p className="form-message" role="status">{message}</p> : null}
      </div>

      <div className="project-setup__form">
        <label className="project-name">
          <span>Название проекта</span>
          <input
            type="text"
            value={project?.name ?? ""}
            placeholder="Мой проект"
            onChange={(event) => saveProject(updatedProject(project, { name: event.target.value }))}
          />
        </label>

        <fieldset className="technology-picker">
          <legend>Технологии</legend>
          <div>
            {topics.map((topic) => (
              <button
                className={project?.technologies.includes(topic.id) ? "is-selected" : ""}
                type="button"
                aria-pressed={project?.technologies.includes(topic.id) ?? false}
                onClick={() => toggleTechnology(topic.id)}
                key={topic.id}
              >{topic.label}</button>
            ))}
          </div>
        </fieldset>

        <form className="package-adder" onSubmit={addPackage}>
          <label><span>Пакет</span><input list="radar-packages" value={packageName} placeholder="например, next" onChange={(event) => setPackageName(event.target.value)} /></label>
          <label><span>Версия или диапазон</span><input value={packageVersion} placeholder="например, ^15.4.0" onChange={(event) => setPackageVersion(event.target.value)} /></label>
          <button className="icon-button" type="submit" aria-label="Добавить пакет" title="Добавить пакет"><Plus aria-hidden="true" size={18} /></button>
          <datalist id="radar-packages">{packageRegistry.map(({ name }) => <option value={name} key={name} />)}</datalist>
        </form>

        {project?.packages.length ? (
          <div className="project-packages" aria-label="Пакеты проекта">
            {project.packages.map((entry) => (
              <div key={entry.name}><code>{entry.name}</code><span>{entry.version}</span><button type="button" onClick={() => removePackage(entry.name)} aria-label={`Удалить ${entry.name}`} title="Удалить пакет"><X aria-hidden="true" size={15} /></button></div>
            ))}
          </div>
        ) : <p className="project-packages__empty">Импортируйте файл или добавьте ключевые пакеты вручную.</p>}

        {project ? (
          <button className="danger-link" type="button" onClick={() => window.confirm("Удалить локальный профиль проекта?") && clearProject()}>
            <Trash2 aria-hidden="true" size={16} /> Удалить локальный профиль
          </button>
        ) : null}
      </div>
    </section>
  );
}

function QueueRow({ entry }: { entry: QueueEntry }) {
  const { project, setActionStatus } = useReadingState();
  const relevance = relevanceForItem(entry.item, project);
  const steps = entry.item.actionItems?.length ? entry.item.actionItems : [entry.item.nextStep];

  return (
    <article className={`queue-row queue-row--${entry.status}`}>
      <div className="queue-row__priority"><span className={`priority priority--${entry.item.priority}`}>{entry.item.priority}</span></div>
      <div className="queue-row__body">
        <div className="queue-row__meta"><span>{entry.item.source}</span><time dateTime={entry.issueDate}>{formatIssueDate(entry.issueDate)}</time></div>
        <h3>
          <a className="article-title-link" href={entry.item.url} target="_blank" rel="noopener noreferrer">
            {entry.item.title}<ExternalLink aria-hidden="true" size={14} />
          </a>
        </h3>
        <ItemSignals item={entry.item} relevance={relevance} />
        <ul>{steps.map((step) => <li key={step}>{step}</li>)}</ul>
      </div>
      <div className="queue-row__actions">
        {entry.status === "recommended" ? <button type="button" onClick={() => setActionStatus(entry.item.url, "planned")}><ListPlus aria-hidden="true" size={17} /> В план</button> : null}
        {entry.status === "planned" ? <button type="button" onClick={() => setActionStatus(entry.item.url, "done")}><Check aria-hidden="true" size={17} /> Готово</button> : null}
        {entry.status === "done" || entry.status === "dismissed" ? <button type="button" onClick={() => setActionStatus(entry.item.url, "planned")}><RotateCcw aria-hidden="true" size={17} /> Вернуть</button> : null}
        {entry.status !== "dismissed" ? <button className="queue-row__quiet-action" type="button" onClick={() => setActionStatus(entry.item.url, "dismissed")}><X aria-hidden="true" size={17} /> Скрыть</button> : null}
        <a href={entry.item.url} target="_blank" rel="noopener noreferrer" aria-label="Открыть первоисточник" title="Открыть первоисточник"><ExternalLink aria-hidden="true" size={17} /></a>
      </div>
    </article>
  );
}

function QueueSection({ title, eyebrow, entries, empty }: { title: string; eyebrow: string; entries: QueueEntry[]; empty: string }) {
  return (
    <section className="queue-section">
      <div className="queue-section__head"><div><span>{eyebrow}</span><h2>{title}</h2></div><strong>{entries.length}</strong></div>
      {entries.length ? <div className="queue-list">{entries.map((entry) => <QueueRow entry={entry} key={entry.item.url} />)}</div> : <p className="queue-empty">{empty}</p>}
    </section>
  );
}

function ActionQueue({ catalog }: { catalog: ArchiveCatalog }) {
  const { project, actions } = useReadingState();
  const [copied, setCopied] = useState(false);
  const latestDate = catalog.issues[0]?.date ?? "1970-01-01";
  const entries = useMemo(() => allCatalogItems(catalog)
    .flatMap(({ item, issueDate }) => {
      const savedStatus = actions[item.url]?.status;
      const recommended = isRecommendedAction(item, issueDate, latestDate, project);
      return savedStatus || recommended ? [{ item, issueDate, status: savedStatus ?? "recommended" } as QueueEntry] : [];
    })
    .sort((left, right) => priorityRank[left.item.priority] - priorityRank[right.item.priority] || right.issueDate.localeCompare(left.issueDate)), [actions, catalog, latestDate, project]);

  const recommended = entries.filter(({ status }) => status === "recommended");
  const planned = entries.filter(({ status }) => status === "planned");
  const done = entries.filter(({ status }) => status === "done");
  const dismissed = entries.filter(({ status }) => status === "dismissed");

  const copyQueue = async () => {
    const markdown = [...recommended, ...planned].map(({ item }) => {
      const steps = item.actionItems?.length ? item.actionItems : [item.nextStep];
      return `- [ ] **${item.priority} ${item.title}** — [источник](${item.url})\n${steps.map((step) => `  - ${step}`).join("\n")}`;
    }).join("\n");
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="action-queue">
      <div className="action-queue__title">
        <div><p className="eyebrow">Умная очередь</p><h2>Что проверить и обновить</h2><p>{project ? `Рекомендации для «${project.name}» и действия, добавленные вручную.` : "Добавьте стек, чтобы получать автоматические рекомендации. Ручные пункты сохраняются и без профиля."}</p></div>
        <button className="button button--ink" type="button" disabled={!recommended.length && !planned.length} onClick={copyQueue}><Copy aria-hidden="true" size={17} /> {copied ? "Скопировано" : "Скопировать Markdown"}</button>
      </div>
      <QueueSection title="Требует внимания" eyebrow="Автоматически" entries={recommended} empty={project ? "Новых обязательных действий для выбранного стека нет." : "Сначала импортируйте package.json или выберите технологии."} />
      <QueueSection title="Запланировано" eyebrow="В работе" entries={planned} empty="Добавляйте материалы в план с главной, из архива или из рекомендаций." />
      <QueueSection title="Готово" eyebrow="История" entries={done} empty="Завершённые действия появятся здесь." />
      {dismissed.length ? <details className="dismissed-actions"><summary>Скрытые действия: {dismissed.length}</summary><div className="queue-list">{dismissed.map((entry) => <QueueRow entry={entry} key={entry.item.url} />)}</div></details> : null}
    </div>
  );
}

export function ProjectWorkspace({ catalog }: { catalog: ArchiveCatalog }) {
  return <><ProjectSetup /><VersionRadar catalog={catalog} /><ActionQueue catalog={catalog} /></>;
}
