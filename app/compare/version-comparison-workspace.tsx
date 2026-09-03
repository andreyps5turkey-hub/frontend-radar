"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  FileText,
  GitPullRequestArrow,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { major, valid } from "semver";
import type { PackageCatalogV1 } from "@/lib/package-catalog";
import type { PackageManager } from "@/lib/project";
import { packageGroupForName } from "@/lib/package-catalog";
import { comparePath, migrationPath, packageCatalogPath } from "@/lib/site";
import {
  buildVersionComparison,
  comparisonPullRequestMarkdown,
  comparisonVersions,
  migrationDefinitions,
} from "@/lib/version-comparison";
import { useReadingState } from "../reading-state";

const managers: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];
const advisoryLabels = { resolved: "Закрывается", active: "Остаётся активным", introduced: "Появляется в цели" } as const;

function downloadMarkdown(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function defaultRange(catalog: PackageCatalogV1, slug: string, projectVersion?: string) {
  const item = catalog.packages.find((entry) => entry.slug === slug) ?? catalog.packages[0];
  const versions = item ? comparisonVersions(item) : [];
  const target = versions[0]?.version ?? "";
  const exactProject = valid(projectVersion ?? "")?.toString();
  if (exactProject && versions.some(({ version }) => version === exactProject) && exactProject !== target) return { current: exactProject, target };
  const targetMajor = valid(target) ? major(target) : null;
  const previous = targetMajor === null ? null : versions.find(({ version }) => major(version) < targetMajor);
  return { current: previous?.version ?? versions[1]?.version ?? "", target };
}

export function VersionComparisonWorkspace() {
  const { project } = useReadingState();
  const [catalog, setCatalog] = useState<PackageCatalogV1 | null>(null);
  const [loadError, setLoadError] = useState("");
  const [slug, setSlug] = useState("");
  const [currentVersion, setCurrentVersion] = useState("");
  const [targetVersion, setTargetVersion] = useState("");
  const [manager, setManager] = useState<PackageManager>(project?.packageManager ?? "pnpm");
  const [copied, setCopied] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    let active = true;
    fetch(packageCatalogPath())
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<PackageCatalogV1>;
      })
      .then((value) => active && setCatalog(value))
      .catch(() => active && setLoadError("Не удалось загрузить каталог версий. Обновите страницу и повторите попытку."));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!catalog || initialized.current) return;
    const query = new URLSearchParams(window.location.search);
    const requestedSlug = query.get("package");
    const projectPackage = project?.packages.find((entry) => packageGroupForName(entry.name));
    const projectGroup = projectPackage ? packageGroupForName(projectPackage.name) : null;
    const initialSlug = catalog.packages.some((item) => item.slug === requestedSlug)
      ? requestedSlug!
      : projectGroup?.slug ?? catalog.packages[0]?.slug ?? "";
    const range = defaultRange(catalog, initialSlug, projectPackage?.resolvedVersion ?? projectPackage?.version);
    const requestedFrom = query.get("from");
    const requestedTo = query.get("to");
    setSlug(initialSlug);
    setCurrentVersion(valid(requestedFrom ?? "")?.toString() ?? range.current);
    setTargetVersion(valid(requestedTo ?? "")?.toString() ?? range.target);
    setManager(project?.packageManager ?? "pnpm");
    initialized.current = true;
  }, [catalog, project]);

  const item = catalog?.packages.find((entry) => entry.slug === slug) ?? null;
  const versions = useMemo(() => item ? comparisonVersions(item) : [], [item]);
  const comparison = useMemo(() => catalog ? buildVersionComparison(catalog, slug, currentVersion, targetVersion) : null, [catalog, currentVersion, slug, targetVersion]);
  const migrations = useMemo(() => catalog ? migrationDefinitions(catalog).filter((entry) => entry.slug === slug) : [], [catalog, slug]);
  const markdown = comparison ? comparisonPullRequestMarkdown(comparison, manager) : "";

  const choosePackage = (nextSlug: string) => {
    if (!catalog) return;
    const projectPackage = project?.packages.find((entry) => packageGroupForName(entry.name)?.slug === nextSlug);
    const range = defaultRange(catalog, nextSlug, projectPackage?.resolvedVersion ?? projectPackage?.version);
    setSlug(nextSlug);
    setCurrentVersion(range.current);
    setTargetVersion(range.target);
  };

  useEffect(() => {
    if (!initialized.current || !slug || !currentVersion || !targetVersion) return;
    window.history.replaceState(null, "", comparePath({ slug, from: currentVersion, to: targetVersion }));
  }, [currentVersion, slug, targetVersion]);

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (loadError) return <section className="compare-main"><div className="compare-state compare-state--error"><AlertTriangle aria-hidden="true" size={24} /><div><strong>Каталог недоступен</strong><p>{loadError}</p></div></div></section>;
  if (!catalog || !item) return <section className="compare-main"><div className="compare-state"><LoaderCircle className="spin" aria-hidden="true" size={24} /><div><strong>Загружаем стабильные версии</strong><p>Каталог будет использован только в этом браузере.</p></div></div></section>;

  const resolvedAdvisories = comparison?.advisories.filter(({ state }) => state === "resolved").length ?? 0;
  const activeAdvisories = comparison?.advisories.filter(({ state }) => state !== "resolved").length ?? 0;
  const visibleReleases = comparison?.releases.slice(-18).reverse() ?? [];

  return (
    <div className="compare-main">
      <section className="compare-controls" aria-label="Параметры сравнения">
        <label><span>Пакет</span><select value={slug} onChange={(event) => choosePackage(event.target.value)}>{catalog.packages.map((entry) => <option value={entry.slug} key={entry.slug}>{entry.label}</option>)}</select></label>
        <label><span>Текущая версия</span><select value={currentVersion} onChange={(event) => setCurrentVersion(event.target.value)}>{versions.filter(({ version }) => version !== targetVersion).map(({ version }) => <option value={version} key={version}>{version}</option>)}</select></label>
        <ArrowRight className="compare-controls__arrow" aria-hidden="true" size={20} />
        <label><span>Целевая версия</span><select value={targetVersion} onChange={(event) => setTargetVersion(event.target.value)}>{versions.filter(({ version }) => version !== currentVersion).map(({ version }) => <option value={version} key={version}>{version}</option>)}</select></label>
        <div className="compare-manager"><span>Команды</span><div className="segmented-control">{managers.map((entry) => <button className={manager === entry ? "is-active" : ""} type="button" onClick={() => setManager(entry)} key={entry}>{entry}</button>)}</div></div>
      </section>

      {!comparison ? (
        <div className="compare-state compare-state--error"><AlertTriangle aria-hidden="true" size={24} /><div><strong>Неверный порядок версий</strong><p>Целевая версия должна быть новее текущей.</p></div></div>
      ) : (
        <>
          <section className="compare-summary" aria-label="Сводка сравнения">
            <div><span>Переход</span><strong>{comparison.changeKind}</strong><small>{comparison.currentVersion} → {comparison.targetVersion}</small></div>
            <div><span>Релизы</span><strong>{comparison.releases.length}</strong><small>stable в диапазоне</small></div>
            <div><span>Advisory закрывается</span><strong>{resolvedAdvisories}</strong><small>{activeAdvisories ? `ещё проверить: ${activeAdvisories}` : "активных в цели нет"}</small></div>
            <div><span>Требования</span><strong>{comparison.requirements.length}</strong><small>peer и Node.js</small></div>
          </section>

          <section className="compare-workspace">
            <div className="compare-releases">
              <div className="compare-section-head"><div><span>Диапазон изменений</span><h2>Стабильные релизы</h2></div><strong>{comparison.releases.length}</strong></div>
              <div className="compare-release-list">
                {visibleReleases.map((release) => <div key={release.version}><code>v{release.version}</code><time dateTime={release.publishedAt ?? undefined}>{release.publishedAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(release.publishedAt)) : "дата неизвестна"}</time></div>)}
                {comparison.releases.length > visibleReleases.length ? <p>Ещё релизов в диапазоне: {comparison.releases.length - visibleReleases.length}.</p> : null}
              </div>
            </div>

            <aside className="compare-requirements">
              <div className="compare-section-head"><div><span>Целевая версия</span><h2>Совместимость</h2></div>{comparison.targetRule ? <ShieldCheck aria-label="Правило найдено" size={22} /> : <AlertTriangle aria-label="Нужна ручная проверка" size={22} />}</div>
              <dl><div><dt>Пакет</dt><dd><code>{comparison.packageInfo.primaryPackage}</code></dd></div><div><dt>Версия</dt><dd><code>{comparison.targetVersion}</code></dd></div><div><dt>Уверенность</dt><dd>{comparison.targetRule ? "Точное правило" : "Недостаточно данных"}</dd></div></dl>
              {comparison.requirements.length ? <div className="compare-requirements__list"><strong>Требуется</strong><ul>{comparison.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></div> : <p className="compare-requirements__quiet"><Check aria-hidden="true" size={16} /> Обязательные peer/engine-ограничения не указаны.</p>}
              {comparison.warnings.map((warning) => <p className="compare-warning" key={warning}><AlertTriangle aria-hidden="true" size={16} />{warning}</p>)}
              <a href={comparison.packageInfo.repositoryUrl} target="_blank" rel="noopener noreferrer">Официальный репозиторий <ExternalLink aria-hidden="true" size={14} /></a>
            </aside>
          </section>

          {comparison.advisories.length ? <section className="compare-advisories"><div className="compare-section-head"><div><span>GitHub Advisory Database</span><h2>Безопасность перехода</h2></div></div>{comparison.advisories.map(({ advisory, state, fixedVersion }) => <a href={advisory.url} target="_blank" rel="noopener noreferrer" key={advisory.ghsaId}><span className={`compare-advisory-state compare-advisory-state--${state}`}>{advisoryLabels[state]}</span><strong>{advisory.ghsaId}</strong><p>{advisory.title}</p><small>{fixedVersion ? `Исправлено в ${fixedVersion}` : "Исправленная версия не указана"}</small><ExternalLink aria-hidden="true" size={15} /></a>)}</section> : null}

          <section className="compare-events"><div className="compare-section-head"><div><span>Русские конспекты</span><h2>Важные события диапазона</h2></div><strong>{comparison.events.length}</strong></div>{comparison.events.length ? comparison.events.map((event) => <a href={event.url} target="_blank" rel="noopener noreferrer" key={event.id}><span>{event.kind}</span><div><strong>{event.title}</strong><p>{event.summary}</p></div><ExternalLink aria-hidden="true" size={16} /></a>) : <div className="compare-events__empty"><FileText aria-hidden="true" size={20} /><p>В ежедневном радаре для этого диапазона нет отдельных редакционных заметок. Список stable-релизов и правила совместимости показаны выше.</p></div>}</section>

          <section className="pr-draft">
            <div className="pr-draft__head"><div><GitPullRequestArrow aria-hidden="true" size={22} /><span>Готово для команды</span><h2>Текст Pull Request</h2></div><div><button className="button button--primary" type="button" onClick={copyMarkdown}><Clipboard aria-hidden="true" size={16} />{copied ? "Скопировано" : "Скопировать"}</button><button className="icon-button" type="button" onClick={() => downloadMarkdown(`${comparison.packageInfo.slug}-${comparison.currentVersion}-to-${comparison.targetVersion}.md`, markdown)} aria-label="Скачать Markdown" title="Скачать Markdown"><Download aria-hidden="true" size={18} /></button></div></div>
            <code>{comparison.commands[manager]}</code>
            <div className="pr-draft__checklist"><strong>После обновления</strong>{comparison.checklist.map((item) => <span key={item}><Check aria-hidden="true" size={15} />{item}</span>)}</div>
          </section>

          {migrations.length ? <section className="migration-links"><div className="compare-section-head"><div><span>Постоянные страницы</span><h2>Major-миграции {item.label}</h2></div></div><div>{migrations.map((migration) => <a href={migrationPath(migration.slug, migration.transition)} key={migration.transition}><span>{migration.fromMajor}.x → {migration.toMajor}.x</span><strong>{migration.fromVersion} → {migration.toVersion}</strong><ArrowRight aria-hidden="true" size={16} /></a>)}</div></section> : null}
        </>
      )}
    </div>
  );
}
