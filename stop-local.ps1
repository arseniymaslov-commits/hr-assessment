$ErrorActionPreference = "SilentlyContinue"

Get-Process node | Where-Object {
  $_.Path -like "*mvp-next-js-postgresql-prisma-tailwind*\.tools\node-v22.11.0-win-x64\node.exe"
} | Stop-Process -Force

if (Test-Path "C:\CodexPg16\pgsql\bin\pg_ctl.exe") {
  & "C:\CodexPg16\pgsql\bin\pg_ctl.exe" -D "C:\CodexPg16\data" stop
}

Write-Host "Локальное приложение остановлено."
