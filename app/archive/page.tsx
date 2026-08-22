import type { Metadata } from "next";
import catalogData from "@/data/archive/catalog.json";
import type { ArchiveCatalog } from "@/lib/digest";
import { ArchiveExplorer } from "./archive-explorer";
import { SiteHeader } from "../site-header";

const catalog = catalogData as ArchiveCatalog;

export const metadata: Metadata = {
  title: "Архив выпусков | Frontend Radar",
  description: "Поиск по русским конспектам React и frontend-релизов, безопасности и инструментов.",
};

export default function ArchivePage() {
  const materialCount = catalog.issues.reduce((total, issue) => total + issue.items.length + issue.readLater.length, 0);

  return (
    <main>
      <SiteHeader />
      <section className="archive-intro">
        <div className="archive-intro__inner">
          <div>
            <h1>Архив Frontend Radar</h1>
            <p>Все русские конспекты в одном месте. Ищите по технологии, источнику или практическому выводу.</p>
          </div>
          <dl className="archive-stats">
            <div><dt>Выпусков</dt><dd>{catalog.issues.length}</dd></div>
            <div><dt>Материалов</dt><dd>{materialCount}</dd></div>
          </dl>
        </div>
      </section>
      <section className="archive-main">
        <ArchiveExplorer catalog={catalog} />
      </section>
    </main>
  );
}
