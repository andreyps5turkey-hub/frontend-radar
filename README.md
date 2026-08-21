# Frontend Radar

Ежедневная русскоязычная подборка по React и фронтенду. Сайт проверяет официальные
RSS/Atom-ленты и релизы, поднимает безопасность и ломающие изменения наверх,
сохраняет предыдущие выпуски и публикуется через GitHub Pages.

## Что есть в проекте

- актуальный выпуск в `data/digest.json`;
- архив выпусков в `data/archive/`;
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
2. создаёт короткий русский выпуск через GitHub Copilot CLI;
3. проверяет формат, сохраняет архив и собирает статическую страницу;
4. публикует результат на GitHub Pages и коммитит новый выпуск.

Для персонального репозитория GitHub может потребовать секрет
`COPILOT_GITHUB_TOKEN` с разрешением **Copilot Requests**. Если встроенный токен
аккаунта поддерживает Copilot-запросы, дополнительный секрет не нужен.

## Источники

React, Next.js, TypeScript, Vite, React Router, Redux Toolkit, TanStack Query,
Storybook, ESLint, Prettier, MDN, web.dev, TC39, React Status, This Week in React,
Frontend Focus, JavaScript Weekly и Веб-стандарты.
