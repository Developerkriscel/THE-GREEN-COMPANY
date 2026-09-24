<#
.SYNOPSIS
  Apply the Royal Green schema to any Postgres database, in migration order.

.DESCRIPTION
  Windows-friendly runner. This machine has no local psql, so by default the
  script runs psql inside a throwaway Docker container and reaches the target
  database over the network. If you do have psql on PATH, pass -UseLocalPsql.

.PARAMETER ConnectionString
  Postgres URI, e.g. postgresql://user:pass@host:5432/dbname
  Falls back to $env:DATABASE_URL.

.PARAMETER Shim
  Install the plain-Postgres compatibility layer first (auth/storage schemas,
  anon/authenticated roles). Use for a stock Postgres or CI. Omit for a real
  Supabase database, which already has all of it.

.PARAMETER Test
  After applying, run the pgTAP RLS suite.

.EXAMPLE
  ./scripts/apply-schema.ps1 -Shim -Test "postgresql://postgres:pw@host.docker.internal:5432/royalgreen"

.NOTES
  Re-running against a database that already has the schema will fail: the
  migrations use plain CREATE TABLE, not CREATE TABLE IF NOT EXISTS. Point this
  at a scratch database.
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)] [string] $ConnectionString = $env:DATABASE_URL,
  [switch] $Shim,
  [switch] $Test,
  [switch] $UseLocalPsql,
  [string] $PsqlImage = 'postgres:15-alpine'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
  Write-Error "No connection string. Pass one as the first argument or set DATABASE_URL."
}

$root = Split-Path -Parent $PSScriptRoot

function Invoke-SqlFile {
  param([string] $Path)

  $name = Split-Path -Leaf $Path
  Write-Host "==> $name" -ForegroundColor Cyan

  if ($UseLocalPsql) {
    # ON_ERROR_STOP matters: a half-applied schema is worse than none.
    & psql $ConnectionString -v ON_ERROR_STOP=1 --quiet --no-psqlrc -f $Path
  }
  else {
    # Mount the repo read-only and run psql from a container. host.docker.internal
    # is how the container reaches a database listening on the Windows host.
    & docker run --rm -i `
        -v "${root}:/repo:ro" `
        -e PGCONNECT_TIMEOUT=10 `
        $PsqlImage `
        psql $ConnectionString -v ON_ERROR_STOP=1 --quiet --no-psqlrc `
        -f ("/repo/" + ([IO.Path]::GetRelativePath($root, $Path) -replace '\\', '/'))
  }

  if ($LASTEXITCODE -ne 0) {
    Write-Error "$name failed with exit code $LASTEXITCODE. Nothing further was applied."
  }
}

if ($Shim) {
  Invoke-SqlFile (Join-Path $root 'supabase/compat/00_plain_postgres_shim.sql')
}

Get-ChildItem (Join-Path $root 'supabase/migrations') -Filter *.sql |
  Sort-Object Name |
  ForEach-Object { Invoke-SqlFile $_.FullName }

if ($Test) {
  Invoke-SqlFile (Join-Path $root 'supabase/tests/rls.test.sql')
}

Write-Host ''
Write-Host 'Schema applied.' -ForegroundColor Green
