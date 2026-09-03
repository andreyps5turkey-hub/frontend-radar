import { Rss } from "lucide-react";
import { archivePath, comparePath, packagesPath, projectPath, sitePath, weeklyPath } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer__identity">
        <strong>Frontend Radar</strong>
        <span>Русская выжимка, оригинальные ссылки, никакой полной перепечатки.</span>
        <span className="footer__credit">Создал <strong>andrei.chebasov</strong></span>
      </div>
      <nav className="footer__links" aria-label="Навигация внизу страницы">
        <a href={weeklyPath()}>Неделя</a>
        <a href={archivePath()}>Архив</a>
        <a href={packagesPath()}>Пакеты</a>
        <a href={comparePath()}>Сравнение</a>
        <a href={projectPath()}>Мой проект</a>
        <a className="footer__rss" href={sitePath("/feed.xml")}>
          <Rss aria-hidden="true" size={16} /> RSS
        </a>
      </nav>
    </footer>
  );
}
