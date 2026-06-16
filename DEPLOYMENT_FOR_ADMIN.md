# Инструкция для системного администратора

Проект: веб-приложение для ежемесячной оценки взаимодействия между подразделениями.

Стек:

- Next.js 14
- PostgreSQL
- Prisma
- Tailwind CSS
- Node.js LTS
- Nginx как reverse proxy

## 1. Что передается администратору

Передайте администратору всю папку проекта:

```text
mvp-next-js-postgresql-prisma-tailwind
```

Важные файлы:

```text
package.json
prisma/schema.prisma
prisma/seed.ts
.env.production.example
deploy/interaction-assessment.service
deploy/nginx-interaction-assessment.conf
deploy/backup-postgres.sh
README.md
DEPLOYMENT_FOR_ADMIN.md
```

Папки, которые не нужно переносить на сервер:

```text
node_modules
.next
.tools
```

Если передаете архивом, лучше исключить эти папки.

## 2. Требования к виртуальному серверу

Рекомендуемая конфигурация для MVP:

- Ubuntu 22.04 / 24.04 или Debian 12
- 2 CPU
- 2-4 GB RAM
- 20+ GB SSD
- Домен или поддомен: `hr.redpetroleum.kg`
- Открытые порты `80` и `443`
- SSH-доступ для администратора

Для внутреннего теста можно использовать IP сервера и порт `3000`, но для нормальной эксплуатации лучше настроить домен и HTTPS.

## 3. Установка системных пакетов

```bash
sudo apt update
sudo apt install -y git curl nginx postgresql postgresql-contrib
```

Установить Node.js LTS 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 4. Создание базы PostgreSQL

Войти в PostgreSQL:

```bash
sudo -u postgres psql
```

Создать пользователя и базу:

```sql
CREATE USER interaction_app WITH PASSWORD 'CHANGE_ME_STRONG_DB_PASSWORD';
CREATE DATABASE interaction_mvp OWNER interaction_app;
GRANT ALL PRIVILEGES ON DATABASE interaction_mvp TO interaction_app;
\q
```

Замените `CHANGE_ME_STRONG_DB_PASSWORD` на надежный пароль.

## 5. Размещение проекта

Создать папку приложения:

```bash
sudo mkdir -p /var/www/interaction-assessment
sudo chown -R $USER:$USER /var/www/interaction-assessment
```

Скопировать содержимое проекта в:

```text
/var/www/interaction-assessment
```

Перейти в папку:

```bash
cd /var/www/interaction-assessment
```

Установить зависимости:

```bash
npm ci
```

Если `package-lock.json` не передан, использовать:

```bash
npm install
```

## 6. Настройка переменных окружения

Создать `.env`:

```bash
cp .env.production.example .env
```

Отредактировать:

```bash
nano .env
```

Пример:

```env
DATABASE_URL="postgresql://interaction_app:CHANGE_ME_STRONG_DB_PASSWORD@localhost:5432/interaction_mvp?schema=public"
AUTH_SECRET="CHANGE_ME_LONG_RANDOM_SECRET"
NODE_ENV="production"
APP_URL="https://hr.redpetroleum.kg"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM="Оценка взаимодействия <no-reply@redpetroleum.kg>"
CRON_SECRET="CHANGE_ME_RANDOM_CRON_SECRET"
```

Сгенерировать `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

## 7. Подготовка базы приложения

Применить схему Prisma:

```bash
npm run db:push
```

Для первоначальной демонстрации можно загрузить тестовые данные:

```bash
npm run prisma:seed
```

Для боевого запуска без демо-данных seed можно не запускать. Но тогда администратору нужно будет вручную создать первые подразделения и пользователей через базу или временно выполнить seed и потом заменить справочники.

## 8. Сборка приложения

```bash
npm run build
```

Проверочный запуск:

```bash
npm run start
```

Приложение должно открыться локально на сервере:

```text
http://127.0.0.1:3000
```

После проверки остановить процесс `Ctrl+C`.

## 9. Запуск через systemd

Скопировать service-файл:

```bash
sudo cp deploy/interaction-assessment.service /etc/systemd/system/interaction-assessment.service
```

Назначить владельца папки приложения:

```bash
sudo chown -R www-data:www-data /var/www/interaction-assessment
```

Запустить сервис:

```bash
sudo systemctl daemon-reload
sudo systemctl enable interaction-assessment
sudo systemctl start interaction-assessment
sudo systemctl status interaction-assessment
```

Логи:

```bash
sudo journalctl -u interaction-assessment -f
```

## 10. Настройка Nginx

Скопировать конфиг:

```bash
sudo cp deploy/nginx-interaction-assessment.conf /etc/nginx/sites-available/interaction-assessment
```

Открыть файл и заменить домен:

```bash
sudo nano /etc/nginx/sites-available/interaction-assessment
```

Заменить:

```nginx
server_name hr.redpetroleum.kg;
```

на реальный домен или поддомен.

Активировать сайт:

```bash
sudo ln -s /etc/nginx/sites-available/interaction-assessment /etc/nginx/sites-enabled/interaction-assessment
sudo nginx -t
sudo systemctl reload nginx
```

## 11. HTTPS-сертификат

Установить Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Выпустить сертификат:

```bash
sudo certbot --nginx -d hr.redpetroleum.kg
```

Домен приложения: `hr.redpetroleum.kg`.

После этого рабочая ссылка будет:

```text
https://hr.redpetroleum.kg
```

Ссылка для оценивающих:

```text
https://hr.redpetroleum.kg/evaluations
```

## 12. Демо-доступы после seed

Если был выполнен `npm run prisma:seed`, доступны тестовые пользователи:

```text
admin@company.test / demo123
viewer@company.test / demo123
director@company.test / demo123
roman@company.test / demo123
anna@company.test / demo123
```

Важно: для production нужно заменить пользователей, email и пароли. Текущая MVP-авторизация простая, для корпоративной эксплуатации желательно затем подключить SSO/LDAP/Google/Microsoft авторизацию.

## 13. Основные URL

```text
/login        вход
/dashboard    дашборд
/evaluations  форма оценки
/matrix       матрица взаимодействия
/completion   контроль заполнения
/admin        администрирование
```

## 14. Обновление приложения

После передачи новой версии:

```bash
cd /var/www/interaction-assessment
sudo systemctl stop interaction-assessment
npm install
npm run db:push
npm run build
sudo chown -R www-data:www-data /var/www/interaction-assessment
sudo systemctl start interaction-assessment
sudo systemctl status interaction-assessment
```

## 15. Автоматическая обработка просрочек

Чтобы система сама отмечала `Нет взаимодействия` после 3 дней, добавьте регулярный вызов служебного адреса:

```bash
sudo crontab -e
```

Пример строки для проверки каждые 30 минут:

```cron
*/30 * * * * curl -fsS -H "x-cron-secret: CHANGE_ME_RANDOM_CRON_SECRET" https://hr.redpetroleum.kg/api/maintenance/finalize-expired >> /var/log/interaction-assessment-maintenance.log 2>&1
```

Значение `CHANGE_ME_RANDOM_CRON_SECRET` должно совпадать с `CRON_SECRET` в `.env`.

## 16. Бэкапы PostgreSQL

Скопировать скрипт:

```bash
sudo mkdir -p /opt/interaction-assessment
sudo cp deploy/backup-postgres.sh /opt/interaction-assessment/backup-postgres.sh
sudo chmod +x /opt/interaction-assessment/backup-postgres.sh
```

Проверить запуск:

```bash
sudo -u postgres /opt/interaction-assessment/backup-postgres.sh
```

Добавить ежедневный cron, например в `02:30`:

```bash
sudo crontab -e
```

Добавить строку:

```cron
30 2 * * * sudo -u postgres /opt/interaction-assessment/backup-postgres.sh >> /var/log/interaction-assessment-backup.log 2>&1
```

Бэкапы будут храниться в:

```text
/var/backups/interaction-assessment
```

Срок хранения в скрипте: 30 дней.

## 17. Проверочный чеклист

После установки проверить:

- `systemctl status interaction-assessment` показывает `active`.
- `nginx -t` без ошибок.
- Домен открывается по HTTPS.
- `/login` открывается.
- Администратор может войти.
- `/admin` открывается только администратору.
- Руководитель может сохранить оценку.
- Оценка ниже 9 не сохраняется без комментария.
- Кнопка `Нет взаимодействия` сохраняет отметку без числовой оценки.
- `/completion` показывает заполнение обязательных оценок.
- `/api/export` скачивает Excel.

## 18. Порты и доступы

Внешние порты:

```text
80/tcp
443/tcp
```

Внутренний порт приложения:

```text
3000/tcp, только localhost
```

PostgreSQL:

```text
5432/tcp, только localhost
```

Не открывайте PostgreSQL наружу без отдельной необходимости.

## 18. Что нужно уточнить у владельца системы

- Финальный домен или поддомен.
- Список реальных подразделений.
- Список руководителей и их email.
- Кто будет администратором.
- Нужно ли загружать демо-данные или стартовать с пустой базы.
- Требования к корпоративной авторизации.
- Регламент бэкапов и хранения данных.
