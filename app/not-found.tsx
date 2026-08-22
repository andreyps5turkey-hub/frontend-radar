import { SearchX } from "lucide-react";
import { archivePath, sitePath } from "@/lib/site";
import { SiteHeader } from "./site-header";

export default function NotFound() {
  return (
    <main>
      <SiteHeader />
      <section className="not-found">
        <SearchX aria-hidden="true" size={34} />
        <h1>Такого выпуска нет</h1>
        <p>Возможно, ссылка устарела или в эту дату Frontend Radar ещё не выходил.</p>
        <div className="not-found__actions">
          <a className="button button--ink" href={archivePath()}>Открыть архив</a>
          <a className="text-link" href={sitePath("/")}>Вернуться к свежему выпуску</a>
        </div>
      </section>
    </main>
  );
}
