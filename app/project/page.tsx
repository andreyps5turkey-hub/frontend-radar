import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import catalogData from "@/data/archive/catalog.json";
import type { ArchiveCatalog } from "@/lib/digest";
import { projectPath } from "@/lib/site";
import { SiteHeader } from "../site-header";
import { ProjectWorkspace } from "./project-workspace";

const catalog = catalogData as ArchiveCatalog;

export const metadata: Metadata = {
  title: "React Stack Check | Frontend Radar",
  description: "Приватная проверка совместимости React, Next.js, TypeScript и инструментов с консервативным планом обновления.",
  alternates: { canonical: projectPath() },
};

export default function ProjectPage() {
  return (
    <main>
      <SiteHeader />
      <header className="project-header">
        <div className="project-header__inner">
          <div>
            <h1>React Stack Check</h1>
            <p>Проверьте версии, совместимость и путь обновления. Файлы остаются в браузере.</p>
          </div>
          <div className="project-header__privacy"><ClipboardCheck aria-hidden="true" size={20} /><strong>Только на устройстве</strong><span>Без аккаунта, загрузки файлов и внешней синхронизации.</span></div>
        </div>
      </header>
      <div className="project-main"><ProjectWorkspace catalog={catalog} /></div>
    </main>
  );
}
