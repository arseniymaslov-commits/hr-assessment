# Автоматические бэкапы базы Neon

В проект добавлен GitHub Actions workflow `.github/workflows/database-backup.yml`.

Он каждый день в 02:00 по Бишкеку:

1. Подключается к PostgreSQL/Neon по `DATABASE_URL`.
2. Делает `pg_dump` в custom format.
3. Шифрует dump через GPG AES256.
4. Загружает зашифрованный файл в GitHub Actions Artifacts.
5. Хранит artifact 30 дней.

## Что нужно сделать один раз

В GitHub откройте:

`Repository -> Settings -> Secrets and variables -> Actions -> New repository secret`

Добавьте 2 секрета:

| Secret | Что указать |
| --- | --- |
| `DATABASE_URL` | Строка подключения Neon PostgreSQL. Лучше использовать pooled connection URL с `sslmode=require`. |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Длинная фраза шифрования, минимум 20-30 символов. Ее нельзя терять. |

Важно: `BACKUP_ENCRYPTION_PASSPHRASE` нужна для расшифровки бэкапа. Если ее потерять, artifact будет невозможно восстановить.

## Как запустить первый бэкап вручную

1. GitHub -> repository `hr-assessment`.
2. Открыть вкладку `Actions`.
3. Выбрать workflow `Database backup`.
4. Нажать `Run workflow`.
5. После завершения открыть выполненный run и скачать artifact.

## Как проверить, что бэкап создается

В успешном run должны быть файлы:

- `hr-assessment-YYYYMMDD-HHMMSS.dump.gpg`
- `hr-assessment-YYYYMMDD-HHMMSS.dump.gpg.sha256`
- `hr-assessment-YYYYMMDD-HHMMSS.dump.manifest.txt`

## Как расшифровать бэкап

На компьютере с GPG:

```bash
gpg --output hr-assessment.dump --decrypt hr-assessment-YYYYMMDD-HHMMSS.dump.gpg
```

GPG попросит `BACKUP_ENCRYPTION_PASSPHRASE`.

## Как восстановить базу из бэкапа

Восстановление перезаписывает данные в целевой базе. Перед восстановлением лучше создать свежий аварийный бэкап.

```bash
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DATABASE_URL" hr-assessment.dump
```

## Рекомендация

GitHub Artifacts подходят как быстрый старт. Для более надежной схемы лучше позже добавить второе хранилище: S3, Google Cloud Storage, корпоративный сервер или защищенный Google Drive.
