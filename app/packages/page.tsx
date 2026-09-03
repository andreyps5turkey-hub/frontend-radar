import type { Metadata } from "next";
import { ArrowRight, Boxes, ShieldCheck } from "lucide-react";
import catalogData from "@/data/packages/catalog.json";
import type { PackageCatalogV1 } from "@/lib/package-catalog";
import { comparePath, packagesPath, projectPath } from "@/lib/site";
import { SiteHeader } from "../site-header";

const catalog = catalogData as PackageCatalogV1;

export const metadata: Metadata = {
  title: "Пакеты React-стека | Frontend Radar",
  description: "Русская история релизов, требования совместимости и advisory для ключевых пакетов React-экосистемы.",
  alternates: { canonical: packagesPath() },
};

export default function PackagesPage() {
  return (
    <main>
      <SiteHeader />
      <header className="packages-header">
        <div className="packages-header__inner">
          <div><Boxes aria-hidden="true" size={24} /><h1>Пакеты React-стека</h1><p>Версии, совместимость и русская история важных изменений из официальных источников.</p></div>
          <div className="packages-header__actions"><a className="button" href={comparePath()}>Сравнить версии</a><a className="button button--primary" href={projectPath()}>Проверить свой проект <ArrowRight aria-hidden="true" size={17} /></a></div>
        </div>
      </header>
      <div className={`package-catalog-health${catalog.sourceHealth.stale ? " is-stale" : ""}`}>
        <strong>{catalog.sourceHealth.stale ? "Каталог частично устарел" : "Источники отвечают"}</strong>
        <span>Успешно {catalog.sourceHealth.succeeded} из {catalog.sourceHealth.attempted}</span>
        {catalog.sourceHealth.failed.length ? <span>Временно недоступны: {catalog.sourceHealth.failed.join(", ")}</span> : null}
      </div>
      <section className="package-directory" aria-label="Поддерживаемые пакеты">
        <div className="package-directory__header"><span>Пакет</span><span>Последняя версия</span><span>Advisory</span><span>Обновлено</span><span /></div>
        {catalog.packages.map((item) => (
          <a href={packagesPath(item.slug)} key={item.slug}>
            <span className="package-directory__name"><strong>{item.label}</strong><code>{item.primaryPackage}</code></span>
            <span data-label="Последняя версия"><strong>{item.latestVersion ? `v${item.latestVersion}` : "нет данных"}</strong></span>
            <span data-label="Advisory"><ShieldCheck aria-hidden="true" size={17} /><strong>{item.advisories.length}</strong><small>в истории</small></span>
            <time data-label="Обновлено" dateTime={item.latestPublishedAt ?? undefined}>{item.latestPublishedAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(item.latestPublishedAt)) : "нет данных"}</time>
            <ArrowRight aria-hidden="true" size={18} />
          </a>
        ))}
      </section>
      <p className="package-directory__note">Данные обновлены {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(catalog.generatedAt))}. Проверка проекта охватывает только поддерживаемые прямые зависимости.</p>
    </main>
  );
}
