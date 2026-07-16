param(
  [Parameter(Mandatory = $true)]
  [string]$File
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is not set. Add it to the current terminal session before running restore."
}

$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) {
  throw "pg_restore was not found. Install PostgreSQL client tools and make sure pg_restore is available in PATH."
}

$resolvedFile = Resolve-Path $File
& pg_restore --clean --if-exists --no-owner --no-acl --dbname $env:DATABASE_URL $resolvedFile

if ($LASTEXITCODE -ne 0) {
  throw "Database restore failed."
}

Write-Host "Database restored from: $resolvedFile"
