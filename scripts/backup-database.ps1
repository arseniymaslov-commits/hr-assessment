param(
  [string]$OutputDir = "backups"
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is not set. Add it to the current terminal session before running backup."
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  throw "pg_dump was not found. Install PostgreSQL client tools and make sure pg_dump is available in PATH."
}

$resolvedOutputDir = Join-Path (Get-Location) $OutputDir
New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $resolvedOutputDir "hr-assessment-$timestamp.dump"

& pg_dump $env:DATABASE_URL --format=custom --no-owner --no-acl --file $file

if ($LASTEXITCODE -ne 0) {
  throw "Database backup failed."
}

Write-Host "Backup created: $file"
