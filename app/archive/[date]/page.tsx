import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import catalogData from "@/data/archive/catalog.json";
import type { ArchiveCatalog } from "@/lib/digest";
import { formatIssueDate } from "@/lib/digest";
import { archivePath } from "@/lib/site";
import { DigestCard } from "../../digest-card";
import { SiteHeader } from "../../site-header";
import { SourceHealthPanel } from "../../source-health";

const catalog = catalogData as ArchiveCatalog;

export function generateStaticParams() {
  return catalog.issues.map(({ date }) => ({ date }));
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  const issue = catalog.issues.find((item) => item.date === date);
  if (!issue) return { title: "Выпуск не найден | Frontend Radar" };
  return {
    title: `${formatIssueDate(issue.date)} | Frontend Radar`,
    description: issue.summary,
    alternates: { canonical: archivePath(issue.date) },
  };
}

export default async function ArchiveIssuePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const index = catalog.issues.findIndex((issue) => issue.date === date);
  if (index < 0) notFound();

  const issue = catalog.issues[index];
  const newer = catalog.issues[index - 1];
  const older = catalog.issues[index + 1];

  return (
    <main>
      <SiteHeader />
      <header className="issue-header">
        <div className="issue-header__inner">
          <a className="back-link" href={archivePath()}><ChevronLeft aria-hidden="true" size={17} /> Все выпуски</a>
          <div className="issue-header__title">
            <div>
              <span className={`priority priority--${issue.status === "active" ? "P1" : "P2"}`}>
                {issue.status === "active" ? "Есть события" : "Спокойный выпуск"}
              </span>
              <h1>{formatIssueDate(issue.date)}</h1>
              <p>{issue.summary}</p>
            </div>
            <SourceHealthPanel digest={issue} compact />
          </div>
        </div>
      </header>

      <section className="section issue-content">
        <div className="section__head">
          <h2>Что требовало внимания</h2>
        </div>
        {issue.items.length ? (
          <div className="digest-grid">
            {issue.items.map((item) => <DigestCard item={item} key={item.url} />)}
          </div>
        ) : (
          <div className="quiet-state">
            <span className="quiet-state__mark" aria-hidden="true">✓</span>
            <div><h3>Срочных событий не было</h3><p>{issue.summary}</p></div>
          </div>
        )}
      </section>

      <section className="section issue-content issue-content--later">
        <div className="section__head"><h2>Полезное на потом</h2></div>
        <div className="digest-grid">
          {issue.readLater.map((item) => <DigestCard item={item} key={item.url} />)}
        </div>
      </section>

      <nav className="issue-pagination" aria-label="Соседние выпуски">
        {older ? <a href={archivePath(older.date)}><ChevronLeft aria-hidden="true" size={18} /><span><small>Раньше</small>{formatIssueDate(older.date)}</span></a> : <span />}
        {newer ? <a href={archivePath(newer.date)}><span><small>Позже</small>{formatIssueDate(newer.date)}</span><ChevronRight aria-hidden="true" size={18} /></a> : <span />}
      </nav>
    </main>
  );
}
