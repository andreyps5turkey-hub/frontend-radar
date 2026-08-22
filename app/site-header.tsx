import { Rss } from "lucide-react";
import { archivePath, sitePath, weeklyPath } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="brand brand--dark" href={sitePath("/")} aria-label="Frontend Radar, главная">
          <span className="brand__mark">FR</span>
          <span>Frontend Radar</span>
        </a>
        <nav className="site-nav" aria-label="Основная навигация">
          <a href={sitePath("/")}>Сегодня</a>
          <a href={weeklyPath()}>Неделя</a>
          <a href={archivePath()}>Архив</a>
          <a className="site-nav__icon" href={sitePath("/feed.xml")} aria-label="RSS Frontend Radar" title="RSS Frontend Radar">
            <Rss aria-hidden="true" size={18} />
          </a>
        </nav>
      </div>
    </header>
  );
}
