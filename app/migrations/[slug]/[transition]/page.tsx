import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ExternalLink, GitPullRequestArrow } from "lucide-react";
import catalogData from "@/data/packages/catalog.json";
import type { PackageCatalogV1 } from "@/lib/package-catalog";
import { comparePath, migrationPath, packagesPath } from "@/lib/site";
import { buildVersionComparison, migrationDefinitions } from "@/lib/version-comparison";
import { SiteHeader } from "../../../site-header";

const catalog = catalogData as PackageCatalogV1;
const migrations = migrationDefinitions(catalog);

export function generateStaticParams() {
  return migrations.map(({ slug, transition }) => ({ slug, transition }));
}

function migrationFor(slug: string, transition: string) {
  return migrations.find((item) => item.slug === slug && item.transition === transition);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; transition: string }> }): Promise<Metadata> {
  const values = await params;
  const migration = migrationFor(values.slug, values.transition);
  if (!migration) return { title: "Миграция не найдена | Frontend Radar" };
  return {
    title: `${migration.label} ${migration.fromMajor} → ${migration.toMajor}: план миграции | Frontend Radar`,
    description: `Требования, stable-релизы, advisory и checklist для миграции ${migration.label} ${migration.fromMajor}.x → ${migration.toMajor}.x.`,
    alternates: { canonical: migrationPath(migration.slug, migration.transition) },
  };
}

export default async function MigrationPage({ params }: { params: Promise<{ slug: string; transition: string }> }) {
  const values = await params;
  const migration = migrationFor(values.slug, values.transition);
  if (!migration) notFound();
  const comparison = buildVersionComparison(catalog, migration.slug, migration.fromVersion, migration.toVersion);
  if (!comparison) notFound();
  const activeAdvisories = comparison.advisories.filter(({ state }) => state !== "resolved");

  return (
    <main>
      <SiteHeader />
      <header className="migration-header">
        <div className="migration-header__inner">
          <a className="back-link" href={packagesPath(migration.slug)}><ChevronLeft aria-hidden="true" size={17} /> {migration.label}</a>
          <div className="migration-header__title"><div><span>Major migration</span><h1>{migration.label} {migration.fromMajor} → {migration.toMajor}</h1><p>Консервативная отправная точка: от последней stable старой линии к последней stable новой.</p></div><a className="button button--primary" href={comparePath({ slug: migration.slug, from: migration.fromVersion, to: migration.toVersion })}>Настроить сравнение <ArrowRight aria-hidden="true" size={17} /></a></div>
          <dl className="migration-facts"><div><dt>От</dt><dd>{migration.fromVersion}</dd></div><div><dt>До</dt><dd>{migration.toVersion}</dd></div><div><dt>Stable-релизов</dt><dd>{comparison.releases.length}</dd></div><div><dt>Правило цели</dt><dd>{comparison.targetRule ? "Найдено" : "Нужна проверка"}</dd></div></dl>
        </div>
      </header>

      <div className="migration-main">
        <section className="migration-requirements">
          <div className="compare-section-head"><div><span>peerDependencies и engines</span><h2>До изменения кода</h2></div></div>
          {comparison.requirements.length ? <ul>{comparison.requirements.map((requirement) => <li key={requirement}><Check aria-hidden="true" size={16} />{requirement}</li>)}</ul> : <p>У целевой версии нет опубликованных обязательных peer/engine-ограничений.</p>}
          {comparison.warnings.map((warning) => <div className="migration-warning" key={warning}><AlertTriangle aria-hidden="true" size={17} />{warning}</div>)}
        </section>

        <section className="migration-checklist">
          <div className="compare-section-head"><div><span>Проверка после обновления</span><h2>Checklist миграции</h2></div></div>
          <ol>{comparison.checklist.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol>
        </section>

        <section className="migration-command"><div><GitPullRequestArrow aria-hidden="true" size={21} /><span>Стартовая команда</span><code>{comparison.commands.pnpm}</code></div><a href={comparePath({ slug: migration.slug, from: migration.fromVersion, to: migration.toVersion })}>Получить PR-текст <ArrowRight aria-hidden="true" size={16} /></a></section>

        {comparison.events.length ? <section className="migration-events"><div className="compare-section-head"><div><span>Официальные источники</span><h2>Важные изменения диапазона</h2></div></div>{comparison.events.map((event) => <a href={event.url} target="_blank" rel="noopener noreferrer" key={event.id}><span>{event.kind}</span><div><strong>{event.title}</strong><p>{event.summary}</p></div><ExternalLink aria-hidden="true" size={15} /></a>)}</section> : null}

        {comparison.advisories.length ? <section className="migration-security"><div className="compare-section-head"><div><span>Security</span><h2>Advisory в диапазоне</h2></div><strong>{activeAdvisories.length ? `Проверить: ${activeAdvisories.length}` : "Закрываются целевой версией"}</strong></div>{comparison.advisories.map(({ advisory, state }) => <a href={advisory.url} target="_blank" rel="noopener noreferrer" key={advisory.ghsaId}><strong>{advisory.ghsaId}</strong><span>{state === "resolved" ? "Закрывается" : "Требует проверки"}</span><p>{advisory.title}</p><ExternalLink aria-hidden="true" size={15} /></a>)}</section> : null}

        <p className="migration-disclaimer">Страница строится по npm metadata, peerDependencies, engines и GitHub Advisory Database. Перед миграцией прочитайте официальные release notes репозитория.</p>
      </div>
    </main>
  );
}
