import type { Metadata } from "next";
import { GitCompareArrows, LockKeyhole } from "lucide-react";
import { comparePath } from "@/lib/site";
import { SiteHeader } from "../site-header";
import { VersionComparisonWorkspace } from "./version-comparison-workspace";

export const metadata: Metadata = {
  title: "Сравнение версий React-стека | Frontend Radar",
  description: "Сравните версии React, Next.js, TypeScript и инструментов: требования, advisory, команды и готовый текст Pull Request.",
  alternates: { canonical: comparePath() },
};

export default function ComparePage() {
  return (
    <main>
      <SiteHeader />
      <header className="compare-header">
        <div className="compare-header__inner">
          <div>
            <GitCompareArrows aria-hidden="true" size={25} />
            <h1>Сравнение версий</h1>
            <p>Точный диапазон релизов, требования целевой версии и проверяемый план для Pull Request.</p>
          </div>
          <div className="compare-header__privacy"><LockKeyhole aria-hidden="true" size={19} /><span><strong>Локально</strong> Профиль проекта остаётся в браузере.</span></div>
        </div>
      </header>
      <VersionComparisonWorkspace />
    </main>
  );
}
