# Развертывание через GitHub и Vercel

Цель: хранить код в GitHub, автоматически разворачивать приложение на Vercel и использовать облачный PostgreSQL.

## Что важно

Vercel размещает Next.js-приложение. PostgreSQL должен быть отдельным облачным сервисом: Prisma Postgres, Neon, Supabase или другой PostgreSQL с публичной строкой подключения.

Рекомендуемый простой вариант: создать PostgreSQL через Vercel Marketplace. Vercel умеет подключать storage-интеграции к проекту и добавлять переменные окружения автоматически.

## Что уже подготовлено в проекте

- Next.js-приложение готово к Vercel.
- `postinstall` запускает `prisma generate`.
- `vercel.json` добавляет ежедневный cron:
  - `/api/maintenance/finalize-expired`
  - расписание: `0 3 * * *`
- Endpoint cron принимает оба варианта секрета:
  - `Authorization: Bearer CRON_SECRET`
  - `x-cron-secret: CRON_SECRET`

## Переменные окружения в Vercel

В Vercel Project Settings -> Environment Variables добавить для Production:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
AUTH_SECRET="длинная_случайная_строка"
APP_URL="https://hr.redpetroleum.kg"
SMTP_HOST="smtp..."
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASSWORD="..."
SMTP_FROM="Оценка взаимодействия <no-reply@redpetroleum.kg>"
CRON_SECRET="длинная_случайная_строка"
```

Если база подключается через Vercel Marketplace, `DATABASE_URL` может появиться автоматически.

## Публикация кода в GitHub

Вариант через Git на компьютере:

```bash
git init
git add .
git commit -m "Initial interaction assessment app"
git branch -M main
git remote add origin https://github.com/ORG_OR_USER/REPO_NAME.git
git push -u origin main
```

Не отправлять в GitHub файл `.env`. Он уже исключен через `.gitignore`.

## Настройка проекта в Vercel

1. Открыть Vercel.
2. New Project.
3. Import Git Repository.
4. Выбрать репозиторий GitHub.
5. Framework Preset: Next.js.
6. Build Command: оставить стандартный `npm run build`.
7. Install Command: оставить стандартный `npm install`.
8. Добавить переменные окружения.
9. Deploy.

## Импорт базы

После создания облачной PostgreSQL-базы импортировать дамп из локального пакета:

```bash
psql "DATABASE_URL_ОБЛАЧНОЙ_БАЗЫ" -f interaction_mvp_full_YYYY-MM-DD-HHMM.sql
```

Если используется архивный дамп:

```bash
pg_restore -d "DATABASE_URL_ОБЛАЧНОЙ_БАЗЫ" --clean --if-exists --no-owner --no-privileges interaction_mvp_full_YYYY-MM-DD-HHMM.dump
```

После импорта выполнить схему Prisma:

```bash
npx prisma db push
```

Это можно сделать локально, временно указав `DATABASE_URL` облачной базы, либо через Vercel/CI вручную.

## Домен

В Vercel Project Settings -> Domains подключить:

```text
hr.redpetroleum.kg
```

Затем у DNS-провайдера домена настроить записи, которые покажет Vercel.

## Проверка после деплоя

Открыть:

- `https://hr.redpetroleum.kg/login`
- `https://hr.redpetroleum.kg/admin`
- `https://hr.redpetroleum.kg/evaluations`
- `https://hr.redpetroleum.kg/dashboard`

Проверить:

- вход администратора;
- выход из системы;
- сброс пароля;
- запуск оценки отдела;
- запуск оценки для всех СП;
- отправку email;
- экспорт Excel;
- работу cron в Vercel Logs.
