# Frontend Radar

Ежедневная русскоязычная подборка по React и фронтенду. Сайт проверяет официальные
RSS/Atom-ленты и релизы, поднимает безопасность и ломающие изменения наверх,
сохраняет предыдущие выпуски и публикуется через GitHub Pages.

## Что есть в проекте

- актуальный выпуск в `data/digest.json`;
- архив выпусков в `data/archive/`;
- поиск и отдельные страницы каждого архивного выпуска;
- локальные отметки «прочитано», «сохранено» и пресеты любимых тем;
- RSS-лента русских конспектов по адресу `/feed.xml`;
- состояние проверенных и временно недоступных источников;
- сборщик 21 официального источника;
- приоритеты P0–P3;
- русские конспекты без полной перепечатки статей;
- ежедневный GitHub Actions workflow в 05:00 UTC (08:00 МСК);
- автоматическая публикация на GitHub Pages.

## Локальный запуск

Нужен Node.js `>=22.13.0` и pnpm `11.19.0`.

```bash
pnpm install
pnpm run dev
```

Проверка проекта:

```bash
pnpm run digest:validate
pnpm run build
pnpm exec node --test tests/rendered-html.test.mjs
pnpm run pages:export
```

## Ежедневное обновление

Workflow `.github/workflows/pages.yml` запускается по расписанию и вручную. Он:

1. собирает кандидатов из RSS, Atom, GitHub Releases и security advisories;
2. создаёт короткий русский выпуск через Groq `openai/gpt-oss-20b`;
3. проверяет формат, сохраняет архив и обновляет поисковый каталог;
4. собирает главную, архивные страницы, RSS и страницу 404;
5. тестирует и публикует результат на GitHub Pages, затем коммитит новый выпуск.

Для редакторского шага нужен один GitHub Actions secret с именем `GROQ` и API-ключом
Groq. Ключ используется только как `GROQ_API_KEY` внутри шага генерации и не
попадает в репозиторий. При временной недоступности API скрипт создаёт выпуск в
детерминированном резервном режиме, поэтому публикация не останавливается.

## Источники

React, Next.js, TypeScript, Vite, React Router, Redux Toolkit, TanStack Query,
Storybook, ESLint, Prettier, MDN, web.dev, TC39, React Status, This Week in React,
Frontend Focus, JavaScript Weekly и Веб-стандарты.
