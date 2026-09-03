"use client";

import {
  AlertTriangle,
  Check,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  GitCompareArrows,
  LoaderCircle,
  PackageSearch,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PackageCatalogV1 } from "@/lib/package-catalog";
import {
  buildCompatibilityReport,
  appendScanSnapshot,
  createScanSnapshot,
  readScanHistory,
  reportMarkdown,
  scanChanges,
  scanSnapshotCounts,
  type CompatibilitySignal,
  type CompatibilityStatus,
  type ScanSnapshot,
} from "@/lib/compatibility";
import { SCAN_HISTORY_KEY, type PackageManager } from "@/lib/project";
import { packageGroupForName } from "@/lib/package-catalog";
import { comparePath, packageCatalogPath } from "@/lib/site";
import { useReadingState } from "../reading-state";

type RadarFilter = "all" | "attention" | "compatible" | "unknown";

const statusLabels: Record<CompatibilityStatus, string> = {
  compatible: "Совместимо",
  update: "Можно обновить",
  prerequisite: "Нужен шаг",
  conflict: "Конфликт",
  unknown: "Нет данных",
};

const managers: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];

function StatusIcon({ status }: { status: CompatibilityStatus }) {
  if (status === "compatible") return <Check aria-hidden="true" size={17} />;
  if (status === "update") return <Wrench aria-hidden="true" size={17} />;
  if (status === "conflict") return <AlertTriangle aria-hidden="true" size={17} />;
  if (status === "prerequisite") return <ShieldAlert aria-hidden="true" size={17} />;
  return <CircleHelp aria-hidden="true" size={17} />;
}

function SignalRow({ signal, selected, onSelect }: { signal: CompatibilitySignal; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`compatibility-row compatibility-row--${signal.status}${selected ? " is-selected" : ""}`} type="button" onClick={onSelect}>
      <span className="compatibility-row__package" data-label="Пакет"><code>{signal.package.name}</code><small>{signal.confidence === "exact" ? "lock-файл" : signal.confidence === "range" ? "диапазон" : "ручная проверка"}</small></span>
      <span data-label="Установлено"><strong>{signal.currentVersion ?? signal.declaredVersion}</strong></span>
      <span data-label="Рекомендуется"><strong>{signal.targetVersion ?? "—"}</strong>{signal.majorAvailable ? <small>major: {signal.majorAvailable}</small> : null}</span>
      <span className={`compatibility-status compatibility-status--${signal.status}`} data-label="Статус"><StatusIcon status={signal.status} />{statusLabels[signal.status]}</span>
      <span className="compatibility-row__reason" data-label="Причина">{signal.reason}</span>
    </button>
  );
}

function SignalDetails({ signal }: { signal: CompatibilitySignal }) {
  const group = packageGroupForName(signal.package.name);
  const comparisonHref = group && signal.currentVersion && signal.targetVersion
    ? comparePath({ slug: group.slug, from: signal.currentVersion, to: signal.targetVersion })
    : null;
  return (
    <aside className="compatibility-detail" aria-label={`Подробности ${signal.package.name}`}>
      <div className="compatibility-detail__head">
        <div><span>{signal.package.name}</span><h3>Почему это важно</h3></div>
        <span className={`compatibility-status compatibility-status--${signal.status}`}><StatusIcon status={signal.status} />{statusLabels[signal.status]}</span>
      </div>
      <p>{signal.reason}</p>
      <dl>
        <div><dt>Объявлено</dt><dd><code>{signal.declaredVersion}</code></dd></div>
        <div><dt>Определено</dt><dd><code>{signal.currentVersion ?? "нет точной версии"}</code></dd></div>
        <div><dt>Последняя</dt><dd><code>{signal.latestVersion ?? "нет данных"}</code></dd></div>
        <div><dt>Цель</dt><dd><code>{signal.targetVersion ?? "обновление не требуется"}</code></dd></div>
      </dl>
      {signal.advisories.length ? (
        <div className="compatibility-detail__advisories">
          <strong>Advisory</strong>
          {signal.advisories.slice(0, 3).map(({ advisory, confidence, fixedVersion }) => (
            <a href={advisory.url} target="_blank" rel="noopener noreferrer" key={advisory.ghsaId}>
              <span>{advisory.ghsaId} · {advisory.severity}</span>
              <small>{confidence === "exact" ? "версия затронута" : "диапазоны пересекаются"}{fixedVersion ? ` · исправлено в ${fixedVersion}` : ""}</small>
              <ExternalLink aria-hidden="true" size={14} />
            </a>
          ))}
        </div>
      ) : null}
      {signal.requirements.length ? <div className="compatibility-detail__list"><strong>Требования выбранной версии</strong><ul>{signal.requirements.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {signal.blockers.length ? <div className="compatibility-detail__list compatibility-detail__list--danger"><strong>Что мешает</strong><ul>{signal.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {signal.sourceUrl ? <a className="text-link" href={signal.sourceUrl} target="_blank" rel="noopener noreferrer">Официальный источник <ExternalLink aria-hidden="true" size={14} /></a> : null}
      {comparisonHref ? <a className="text-link" href={comparisonHref}><GitCompareArrows aria-hidden="true" size={14} /> Сравнить версии и получить PR-текст</a> : null}
    </aside>
  );
}

function downloadText(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CompatibilityRadar() {
  const { project, saveProject } = useReadingState();
  const [catalog, setCatalog] = useState<PackageCatalogV1 | null>(null);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<RadarFilter>("all");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [changes, setChanges] = useState<string[]>([]);
  const [history, setHistory] = useState<ScanSnapshot[]>([]);

  useEffect(() => {
    if (!project?.packages.length || catalog) return;
    let active = true;
    fetch(packageCatalogPath())
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<PackageCatalogV1>;
      })
      .then((value) => active && setCatalog(value))
      .catch(() => active && setLoadError("Не удалось загрузить локальный каталог совместимости. Обновите страницу и повторите попытку."));
    return () => { active = false; };
  }, [catalog, project?.packages.length]);

  const report = useMemo(() => catalog ? buildCompatibilityReport(project, catalog) : null, [catalog, project]);
  const selected = report?.signals.find(({ package: item }) => item.name === selectedName) ?? report?.signals[0] ?? null;
  const filtered = report?.signals.filter((signal) => filter === "all"
    || (filter === "attention" && ["conflict", "prerequisite", "update"].includes(signal.status))
    || (filter === "compatible" && signal.status === "compatible")
    || (filter === "unknown" && signal.status === "unknown")) ?? [];
  const counts = report?.signals.reduce((result, signal) => ({ ...result, [signal.status]: result[signal.status] + 1 }), { compatible: 0, update: 0, prerequisite: 0, conflict: 0, unknown: 0 }) ?? { compatible: 0, update: 0, prerequisite: 0, conflict: 0, unknown: 0 };

  useEffect(() => {
    if (!report || !catalog || !report.signals.length) return;
    const current = createScanSnapshot(report, catalog.generatedAt);
    const stored = readScanHistory(window.localStorage.getItem(SCAN_HISTORY_KEY));
    const previous = stored[0] ?? null;
    const nextChanges = scanChanges(previous, current);
    const nextHistory = appendScanSnapshot(stored, current);
    const timer = window.setTimeout(() => { setChanges(nextChanges); setHistory(nextHistory); }, 0);
    if (nextHistory !== stored) window.localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify({ version: 2, snapshots: nextHistory }));
    return () => window.clearTimeout(timer);
  }, [catalog, report]);

  if (!project?.packages.length) {
    return <section className="compatibility-radar"><div className="compatibility-empty"><PackageSearch aria-hidden="true" size={26} /><div><strong>Добавьте package.json</strong><p>После импорта появятся точные правила совместимости и консервативный путь обновления.</p></div></div></section>;
  }
  if (loadError) return <section className="compatibility-radar"><div className="compatibility-empty compatibility-empty--error"><AlertTriangle aria-hidden="true" size={24} /><div><strong>Каталог недоступен</strong><p>{loadError}</p></div></div></section>;
  if (!report || !catalog) return <section className="compatibility-radar"><div className="compatibility-empty"><LoaderCircle className="spin" aria-hidden="true" size={24} /><div><strong>Проверяем совместимость</strong><p>Каталог загружается только после импорта проекта.</p></div></div></section>;

  const markdown = reportMarkdown(project, report);
  const copyPlan = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const changeManager = (packageManager: PackageManager) => saveProject({ ...project, packageManager, updatedAt: new Date().toISOString() });

  return (
    <section className="compatibility-radar" aria-labelledby="compatibility-title">
      <div className="compatibility-radar__head">
        <div><p className="eyebrow">React Stack Check</p><h2 id="compatibility-title">Совместимость и путь обновления</h2><p>Проверяем точные версии, peer dependencies, Node.js и известные advisory.</p></div>
        <div className="manager-control"><span>Команды для</span><div className="segmented-control">{managers.map((manager) => <button className={project.packageManager === manager ? "is-active" : ""} type="button" onClick={() => changeManager(manager)} key={manager}>{manager}</button>)}</div></div>
      </div>

      <div className="compatibility-summary" aria-label="Сводка проверки">
        <button type="button" onClick={() => setFilter("attention")}><AlertTriangle aria-hidden="true" size={22} /><span>Конфликт</span><strong>{counts.conflict}</strong></button>
        <button type="button" onClick={() => setFilter("attention")}><ShieldAlert aria-hidden="true" size={22} /><span>Нужен шаг</span><strong>{counts.prerequisite}</strong></button>
        <button type="button" onClick={() => setFilter("attention")}><Wrench aria-hidden="true" size={22} /><span>Обновить</span><strong>{counts.update}</strong></button>
        <button type="button" onClick={() => setFilter("compatible")}><Check aria-hidden="true" size={22} /><span>Совместимо</span><strong>{counts.compatible}</strong></button>
        <button type="button" onClick={() => setFilter("unknown")}><CircleHelp aria-hidden="true" size={22} /><span>Нет данных</span><strong>{counts.unknown}</strong></button>
      </div>

      <div className="compatibility-controls">
        <div className="segmented-control" aria-label="Фильтр результатов">
          <button className={filter === "all" ? "is-active" : ""} type="button" onClick={() => setFilter("all")}>Все</button>
          <button className={filter === "attention" ? "is-active" : ""} type="button" onClick={() => setFilter("attention")}>Требуют внимания</button>
          <button className={filter === "compatible" ? "is-active" : ""} type="button" onClick={() => setFilter("compatible")}>Совместимо</button>
          <button className={filter === "unknown" ? "is-active" : ""} type="button" onClick={() => setFilter("unknown")}>Нет данных</button>
        </div>
        <span>Каталог: {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(catalog.generatedAt))}</span>
      </div>

      <div className="compatibility-workspace">
        <div className="compatibility-table" role="list">
          <div className="compatibility-table__header"><span>Пакет</span><span>Установлено</span><span>Рекомендуется</span><span>Статус</span><span>Причина</span></div>
          {filtered.map((signal) => <SignalRow signal={signal} selected={selected?.package.name === signal.package.name} onSelect={() => setSelectedName(signal.package.name)} key={signal.package.name} />)}
          {!filtered.length ? <p className="compatibility-table__empty">В этой группе результатов нет.</p> : null}
        </div>
        {selected ? <SignalDetails signal={selected} /> : null}
      </div>

      <div className="upgrade-plan">
        <div className="upgrade-plan__head"><div><p className="eyebrow">Консервативная стратегия</p><h3>План обновления</h3><p>{report.blocked ? "Есть конфликт, который нужно разрешить до выполнения команд." : "Security сначала, затем совместимые patch/minor внутри текущего major."}</p></div><div><button className="button button--ink" type="button" onClick={copyPlan}><Copy aria-hidden="true" size={16} />{copied ? "Скопировано" : "Скопировать Markdown"}</button><button className="icon-button" type="button" onClick={() => downloadText("frontend-radar-update-plan.md", markdown)} aria-label="Скачать Markdown" title="Скачать Markdown"><Download aria-hidden="true" size={18} /></button></div></div>
        {report.steps.length ? <ol>{report.steps.map((step) => <li key={step.id}><span>{step.kind === "security" ? <ShieldAlert aria-hidden="true" size={17} /> : step.kind === "manual" ? <AlertTriangle aria-hidden="true" size={17} /> : <Wrench aria-hidden="true" size={17} />}</span><div><strong>{step.title}</strong><p>{step.detail}</p>{step.command ? <code>{step.command}</code> : null}</div></li>)}</ol> : <div className="upgrade-plan__quiet"><Check aria-hidden="true" size={19} />Совместимых обновлений внутри текущих major-линий нет.</div>}
        <details><summary>Что проверить после обновления</summary><ul>{report.checklist.map((item) => <li key={item}>{item}</li>)}</ul></details>
      </div>

      <details className="scan-changes" open={Boolean(changes.length)}><summary><GitCompareArrows aria-hidden="true" size={18} /> Изменения с прошлого сканирования <span>{changes.length}</span></summary>{changes.length ? <ul>{changes.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Это первое сканирование проекта или результаты не изменились.</p>}</details>
      <details className="scan-history"><summary>История локальных проверок <span>{history.length}</span></summary><div>{history.map((snapshot) => { const snapshotCounts = scanSnapshotCounts(snapshot); return <article key={`${snapshot.generatedAt}:${snapshot.catalogGeneratedAt}`}><time dateTime={snapshot.generatedAt}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(snapshot.generatedAt))}</time><span>Пакетов: {Object.keys(snapshot.packages).length}</span><span>Обновить: {snapshotCounts.update}</span><span>Конфликты: {snapshotCounts.conflict}</span></article>; })}</div></details>
      <p className="compatibility-disclaimer">Проверяются только поддерживаемые прямые зависимости. React Stack Check не заменяет npm audit или Dependabot.</p>
    </section>
  );
}
