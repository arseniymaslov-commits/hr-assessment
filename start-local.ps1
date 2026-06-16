$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Join-Path $root ".tools\node-v22.11.0-win-x64\node.exe"
$npm = Join-Path $root ".tools\node-v22.11.0-win-x64\npm.cmd"
$pg = "C:\CodexPg16\pgsql"
$pgData = "C:\CodexPg16\data"
$pgLog = "C:\CodexPg16\postgres.log"

if (!(Test-Path $node) -or !(Test-Path $npm)) {
  Write-Host "Portable Node/npm не найден. Сначала запустите установку зависимостей из README."
  exit 1
}

if (!(Test-Path (Join-Path $pg "bin\pg_ctl.exe"))) {
  Write-Host "Portable PostgreSQL не найден в C:\CodexPg16."
  exit 1
}

Set-Location $root

try {
  & "$pg\bin\pg_ctl.exe" -D $pgData status | Out-Null
} catch {
  & "$pg\bin\pg_ctl.exe" -D $pgData -l $pgLog -o "-p 5432" start
}

& "$pg\bin\createdb.exe" -h localhost -p 5432 -U postgres interaction_mvp 2>$null

if (!(Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

if (!(Test-Path "node_modules")) {
  & $npm install
}

& $npm run db:push
& $npm run prisma:seed
& $node "node_modules\next\dist\bin\next" dev -p 3000
