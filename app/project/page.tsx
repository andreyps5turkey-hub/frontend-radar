import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import catalogData from "@/data/archive/catalog.json";
import type { ArchiveCatalog } from "@/lib/digest";
import { projectPath } from "@/lib/site";
import { SiteHeader } from "../site-header";
import { ProjectWorkspace } from "./project-workspace";

const catalog = catalogData as ArchiveCatalog;

export const metadata: Metadata = {
  title: "Мой проект | Frontend Radar",
  description: "Локальный профиль frontend-проекта, релевантные обновления и персональная очередь действий.",
  alternates: { canonical: projectPath() },
};

export default function ProjectPage() {
  return (
    <main>
      <SiteHeader />
      <header className="project-header">
        <div className="project-header__inner">
          <div>
            <p className="eyebrow">Персональный радар</p>
            <h1>Мой проект</h1>
            <p>Импортируйте стек один раз, чтобы отличать новости «интересно почитать» от изменений, которые действительно требуют работы.</p>
          </div>
          <div className="project-header__privacy"><ClipboardCheck aria-hidden="true" size={20} /><strong>Только на устройстве</strong><span>Без аккаунта, загрузки файла и внешней синхронизации.</span></div>
        </div>
      </header>
      <div className="project-main"><ProjectWorkspace catalog={catalog} /></div>
    </main>
  );
}
