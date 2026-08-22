"use client";

import {
  Check,
  CircleHelp,
  Copy,
  ExternalLink,
  ListPlus,
  PackageSearch,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ArchiveCatalog } from "@/lib/digest";
import { formatIssueDate } from "@/lib/digest";
import {
  buildUpgradeCommand,
  buildVersionRadar,
  type PackageManager,
  type VersionSignal,
  type VersionSignalStatus,
} from "@/lib/project";
import { useReadingState } from "../reading-state";

type RadarFilter = "all" | "updates" | "quiet";

const statusLabels: Record<VersionSignalStatus, string> = {
  security: "Безопасность",
  major: "Major",
  minor: "Minor",
  patch: "Patch",
  current: "Актуально",
  unknown: "Нет сигнала",
};

const managers: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];

function isActionable(signal: VersionSignal) {
  return ["security", "major", "minor", "patch"].includes(signal.status);
}

function SignalIcon({ status }: { status: VersionSignalStatus }) {
  if (status === "security") return <ShieldAlert aria-hidden="true" size={16} />;
  if (["major", "minor", "patch"].includes(status)) return <TrendingUp aria-hidden="true" size={16} />;
  if (status === "current") return <Check aria-hidden="true" size={16} />;
  return <CircleHelp aria-hidden="true" size={16} />;
}

function VersionRow({ signal }: { signal: VersionSignal }) {
  const { actions, setActionStatus } = useReadingState();
  const isPlanned = signal.item ? actions[signal.item.url]?.status === "planned" : false;
  const confidence = signal.confidence === "source"
    ? "данные источника"
    : signal.confidence === "inferred"
      ? "версия из заголовка"
      : "релиз не найден";

  return (
    <article className={`version-row version-row--${signal.status}`}>
      <div className="version-row__package">
        <code>{signal.package.name}</code>
        <span>{signal.package.sections.includes("devDependencies") ? "devDependency" : "dependency"}</span>
      </div>
      <div className="version-row__installed"><span>Установлено</span><strong>{signal.package.version}</strong></div>
      <div className="version-row__latest">
        <span>Последний сигнал</span>
        <strong>{signal.latestVersionLabel ? `v${signal.latestVersionLabel.replace(/^v/, "")}` : "—"}</strong>
        <small>{confidence}</small>
      </div>
      <div className={`version-status version-status--${signal.status}`}>
        <SignalIcon status={signal.status} />
        <span>{statusLabels[signal.status]}</span>
      </div>
      <div className="version-row__source">
        {signal.item ? (
          <>
            <a href={signal.item.url} target="_blank" rel="noopener noreferrer">{signal.item.title}<ExternalLink aria-hidden="true" size={13} /></a>
            <small>{signal.issueDate ? formatIssueDate(signal.issueDate) : signal.item.source} · {signal.item.source}</small>
          </>
        ) : <span>В сохранённом архиве пока нет релизов этого пакета.</span>}
      </div>
      <div className="version-row__actions">
        {signal.item ? (
          <button
            className={`icon-button${isPlanned ? " is-active" : ""}`}
            type="button"
            aria-label={isPlanned ? "Убрать обновление из плана" : "Добавить обновление в план"}
            aria-pressed={isPlanned}
            title={isPlanned ? "Убрать из плана" : "Добавить в план"}
            onClick={() => setActionStatus(signal.item!.url, isPlanned ? null : "planned")}
          >
            <ListPlus aria-hidden="true" size={17} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function VersionRadar({ catalog }: { catalog: ArchiveCatalog }) {
  const { project, saveProject } = useReadingState();
  const [filter, setFilter] = useState<RadarFilter>("all");
  const [copied, setCopied] = useState(false);
  const signals = useMemo(() => buildVersionRadar(catalog, project), [catalog, project]);
  const manager = project?.packageManager ?? "pnpm";
  const command = useMemo(() => buildUpgradeCommand(signals, manager), [manager, signals]);
  const actionableCount = signals.filter(isActionable).length;
  const currentCount = signals.filter(({ status }) => status === "current").length;
  const unknownCount = signals.filter(({ status }) => status === "unknown").length;
  const filtered = signals.filter((signal) => filter === "all"
    || (filter === "updates" && isActionable(signal))
    || (filter === "quiet" && !isActionable(signal)));

  const changeManager = (packageManager: PackageManager) => {
    if (!project) return;
    saveProject({ ...project, packageManager, updatedAt: new Date().toISOString() });
  };

  const copyCommand = async () => {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="version-radar" aria-labelledby="version-radar-title">
      <div className="version-radar__head">
        <div>
          <p className="eyebrow">Версионный радар</p>
          <h2 id="version-radar-title">Пакеты под наблюдением</h2>
          <p>Релизы из архива сопоставлены с версиями локального профиля.</p>
        </div>
        <div className="version-radar__metrics" aria-label="Сводка версионного радара">
          <div><span>Обновить</span><strong>{actionableCount}</strong></div>
          <div><span>Актуально</span><strong>{currentCount}</strong></div>
          <div><span>Нет сигнала</span><strong>{unknownCount}</strong></div>
        </div>
      </div>

      {!project?.packages.length ? (
        <div className="version-radar__empty"><PackageSearch aria-hidden="true" size={24} /><div><strong>Добавьте пакеты проекта</strong><p>Версионные сигналы появятся после импорта package.json или ручного добавления зависимостей.</p></div></div>
      ) : (
        <>
          <div className="version-radar__controls">
            <div className="segmented-control" aria-label="Фильтр версионного радара">
              <button type="button" className={filter === "all" ? "is-selected" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Все</button>
              <button type="button" className={filter === "updates" ? "is-selected" : ""} aria-pressed={filter === "updates"} onClick={() => setFilter("updates")}>Обновить</button>
              <button type="button" className={filter === "quiet" ? "is-selected" : ""} aria-pressed={filter === "quiet"} onClick={() => setFilter("quiet")}>Без действий</button>
            </div>
            <label className="manager-select"><span>Менеджер</span><select value={manager} onChange={(event) => changeManager(event.target.value as PackageManager)}>{managers.map((entry) => <option value={entry} key={entry}>{entry}</option>)}</select></label>
          </div>

          <div className="version-table">
            <div className="version-table__head" aria-hidden="true"><span>Пакет</span><span>Установлено</span><span>Последний сигнал</span><span>Статус</span><span>Материал</span><span /></div>
            <div className="version-table__body">{filtered.map((signal) => <VersionRow signal={signal} key={signal.package.name} />)}</div>
          </div>

          <div className="upgrade-draft">
            <div><span>Черновик для отдельной ветки</span><code>{command || "Обновлений с известной версией нет"}</code></div>
            <button className="button button--ink" type="button" disabled={!command} onClick={copyCommand}><Copy aria-hidden="true" size={16} />{copied ? "Скопировано" : "Скопировать"}</button>
          </div>
        </>
      )}
    </section>
  );
}
