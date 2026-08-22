import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, ExternalLink, Package, ShieldCheck } from "lucide-react";
import { major, satisfies, valid } from "semver";
import catalogData from "@/data/packages/catalog.json";
import type { CompatibilityRule, PackageCatalogV1, PackageIntelligence } from "@/lib/package-catalog";
import { packagesPath, projectPath } from "@/lib/site";
import { SiteHeader } from "../../site-header";
import { CopyCommand } from "../copy-command";
import { PackageTimeline } from "../package-timeline";

const catalog = catalogData as PackageCatalogV1;

export function generateStaticParams() {
  return catalog.packages.map(({ slug }) => ({ slug }));
}

function packageForSlug(slug: string) {
  return catalog.packages.find((item) => item.slug === slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = packageForSlug((await params).slug);
  if (!item) return { title: "Пакет не найден | Frontend Radar" };
  return {
    title: `${item.label}: релизы и совместимость | Frontend Radar`,
    description: `Версии, требования совместимости, advisory и русская история важных изменений ${item.label}.`,
    alternates: { canonical: packagesPath(item.slug) },
    openGraph: {
      title: `${item.label}: релизы и совместимость`,
      description: `Последняя версия ${item.latestVersion ?? "не определена"}, advisory и требования React-стека.`,
    },
  };
}

function activeAdvisories(item: PackageIntelligence) {
  if (!item.latestVersion || !valid(item.latestVersion)) return [];
  return item.advisories.filter(({ vulnerabilities }) => vulnerabilities.some(({ packageName, vulnerableRange }) => item.packageNames.includes(packageName)
    && satisfies(item.latestVersion!, vulnerableRange.replace(/,\s*/g, " "), { includePrerelease: true })));
}

function majorRules(item: PackageIntelligence) {
  const primary = item.packages.find(({ name }) => name === item.primaryPackage);
  const byMajor = new Map<number, CompatibilityRule>();
  for (const rule of primary?.compatibility ?? []) {
    if (!valid(rule.maxVersion)) continue;
    const line = major(rule.maxVersion);
    if (!byMajor.has(line)) byMajor.set(line, rule);
  }
  return [...byMajor.entries()].sort(([left], [right]) => right - left).slice(0, 4);
}

function jsonLd(item: PackageIntelligence) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${item.label}: релизы и совместимость`,
    url: packagesPath(item.slug),
    about: { "@type": "SoftwareSourceCode", name: item.label, codeRepository: item.repositoryUrl, programmingLanguage: "JavaScript" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Пакеты", item: packagesPath() },
        { "@type": "ListItem", position: 2, name: item.label, item: packagesPath(item.slug) },
      ],
    },
  }).replaceAll("<", "\\u003c");
}

export default async function PackagePage({ params }: { params: Promise<{ slug: string }> }) {
  const item = packageForSlug((await params).slug);
  if (!item) notFound();
  const active = activeAdvisories(item);
  const related = catalog.packages.filter(({ slug }) => slug !== item.slug).slice(0, 3);
  const published = item.latestPublishedAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(item.latestPublishedAt)) : "дата неизвестна";

  return (
    <main>
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(item) }} />
      <header className="package-header">
        <div className="package-header__inner">
          <a className="back-link" href={packagesPath()}><ChevronLeft aria-hidden="true" size={17} /> Пакеты</a>
          <div className="package-header__title"><div><h1>{item.label}: релизы и совместимость</h1><p>Последние версии, advisory и русские практические выводы без пересказа документации.</p></div><a className="button button--primary" href={projectPath()}><ShieldCheck aria-hidden="true" size={17} /> Проверить свой проект</a></div>
          <div className="package-facts">
            <div><Package aria-hidden="true" size={20} /><span><small>Пакет</small><strong>{item.primaryPackage}</strong></span></div>
            <div><span><small>Последняя stable</small><strong>{item.latestVersion ? `v${item.latestVersion}` : "нет данных"}</strong></span></div>
            <div><span><small>Опубликована</small><strong>{published}</strong></span></div>
            <a href={item.npmUrl} target="_blank" rel="noopener noreferrer"><span><small>Реестр</small><strong>npm</strong></span><ExternalLink aria-hidden="true" size={15} /></a>
            <a href={item.repositoryUrl} target="_blank" rel="noopener noreferrer"><span><small>Первоисточник</small><strong>Репозиторий</strong></span><ExternalLink aria-hidden="true" size={15} /></a>
          </div>
        </div>
      </header>

      <section className="package-security" aria-labelledby="package-security-title">
        <div className="package-section-head"><div><span>GitHub Advisory Database</span><h2 id="package-security-title">Безопасность</h2></div><strong className={active.length ? "has-active" : "is-clear"}>{active.length ? `Активных для latest: ${active.length}` : "Для latest активных advisory нет"}</strong></div>
        {item.advisories.slice(0, 8).map((advisory) => (
          <article className="advisory-row" key={advisory.ghsaId}>
            <div><a href={advisory.url} target="_blank" rel="noopener noreferrer">{advisory.ghsaId}<ExternalLink aria-hidden="true" size={13} /></a><p>{advisory.title}</p></div>
            <span data-label="Серьёзность">{advisory.severity}{advisory.cvss ? ` · ${advisory.cvss}` : ""}</span>
            <span data-label="Затронуто">{advisory.vulnerabilities.map(({ vulnerableRange }) => vulnerableRange).join(", ")}</span>
            <span data-label="Исправлено">{advisory.vulnerabilities.map(({ fixedVersion }) => fixedVersion ?? "не указано").join(", ")}</span>
            <time dateTime={advisory.publishedAt}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(advisory.publishedAt))}</time>
          </article>
        ))}
        {!item.advisories.length ? <div className="package-security__clear"><Check aria-hidden="true" size={19} />Проверенных advisory для поддерживаемых npm-пакетов не найдено.</div> : null}
      </section>

      <section className="package-compatibility" aria-labelledby="package-compatibility-title">
        <div className="package-section-head"><div><span>peerDependencies и engines</span><h2 id="package-compatibility-title">Совместимость major-линий</h2></div></div>
        <div className="package-compatibility__header"><span>Линия</span><span>Node.js</span><span>React и связанные пакеты</span><span>Статус</span></div>
        {majorRules(item).map(([line, rule]) => (
          <div className="package-compatibility__row" key={line}>
            <strong>{item.label} {line}.x</strong>
            <code>{rule.nodeRange ?? "не указано"}</code>
            <span>{Object.entries(rule.peerDependencies).length ? Object.entries(rule.peerDependencies).map(([name, range]) => `${name} ${range}`).join(" · ") : "нет обязательных peer-ограничений"}</span>
            <span>{rule.deprecated ? "Deprecated" : "Поддерживается"}</span>
          </div>
        ))}
      </section>

      <PackageTimeline events={item.events} />

      <section className="package-upgrade-check">
        <div><span>Консервативное обновление</span><h2>Что проверить перед обновлением</h2><ul><li>Прочитать release notes и breaking changes для целевой линии.</li><li>Сверить требования Node.js и peer dependencies с проектом.</li><li>Запустить typecheck, тесты и production build в отдельной ветке.</li></ul></div>
        <div className="package-command"><span>Команда для новой установки</span><code>pnpm add {item.primaryPackage}@{item.latestVersion ?? "latest"}</code><CopyCommand command={`pnpm add ${item.primaryPackage}@${item.latestVersion ?? "latest"}`} /></div>
      </section>

      <section className="package-related"><div className="package-section-head"><div><span>Тот же стек</span><h2>Материалы по теме</h2></div></div><div>{related.map((entry) => <a href={packagesPath(entry.slug)} key={entry.slug}><strong>{entry.label}</strong><code>{entry.primaryPackage}</code></a>)}</div></section>
    </main>
  );
}
