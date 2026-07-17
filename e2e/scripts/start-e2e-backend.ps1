<#
.SYNOPSIS
    OBRS-184 — rebuild the E2E database from scratch, then boot the backend on it.
    Invoked by playwright.local.config.ts as the first `webServer` entry.

.DESCRIPTION
    Seeding and booting are ONE script on purpose. Playwright starts `webServer`
    entries BEFORE `globalSetup` runs (webServer is a plugin; plugins precede global
    setup), so a globalSetup that created the database would always lose the race —
    the backend would already have tried to boot against a database that did not
    exist yet, and Flyway would have killed it. Doing both here, in order, removes
    the race instead of trying to time it.

    Every run drops and recreates the database, so the lane is deterministic by
    construction: no state survives between runs, which is precisely what the old
    live-SIT setup could not offer (its fixtures were consumed by the previous run).

    The database, the backend port and the frontend origin are all lane-private
    (obrs184qa / 8181 / 4210) so this can run alongside a developer's own
    :8080 + :4200 stack without either disturbing the other.

.NOTES
    Requires `psql` on PATH and a local Postgres superuser connection.
    Requires OBRS-backend checked out as a sibling (override with OBRS_BACKEND_DIR).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# ── Configuration (env-overridable; defaults match playwright.local.config.ts) ──
$BackendDir  = if ($env:OBRS_BACKEND_DIR)   { $env:OBRS_BACKEND_DIR }   else { Join-Path (Split-Path -Parent $PSScriptRoot | Split-Path -Parent | Split-Path -Parent) 'OBRS-backend' }
$DbName      = if ($env:E2E_DB_NAME)        { $env:E2E_DB_NAME }        else { 'obrs184qa' }
$DbHost      = if ($env:E2E_DB_HOST)        { $env:E2E_DB_HOST }        else { 'localhost' }
$DbPort      = if ($env:E2E_DB_PORT)        { $env:E2E_DB_PORT }        else { '5432' }
$DbUser      = if ($env:E2E_DB_USER)        { $env:E2E_DB_USER }        else { 'postgres' }
$DbPassword  = if ($env:E2E_DB_PASSWORD)    { $env:E2E_DB_PASSWORD }    else { 'P@ssw0rd' }
$BackendPort = if ($env:E2E_BACKEND_PORT)   { $env:E2E_BACKEND_PORT }   else { '8181' }
$FrontendUrl = if ($env:E2E_FRONTEND_URL)   { $env:E2E_FRONTEND_URL }   else { 'http://localhost:4210' }
$JavaHome    = if ($env:JAVA_HOME)          { $env:JAVA_HOME }          else { 'C:\Program Files\Java\jdk-21.0.11' }

$FixtureSql  = Join-Path (Split-Path -Parent $PSScriptRoot) 'fixtures\reschedule-fixture.sql'
$SchemaSql   = Join-Path $BackendDir 'src\main\resources\schema.sql'
$DataSql     = Join-Path $BackendDir 'src\main\resources\data.sql'
$SeedPwSql   = Join-Path $BackendDir 'seed-password.local.sql'

function Fail([string]$msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $BackendDir)) { Fail "OBRS-backend not found at '$BackendDir'. Set OBRS_BACKEND_DIR." }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { Fail "psql is not on PATH (needed to seed the E2E database)." }
foreach ($f in @($SchemaSql, $DataSql, $FixtureSql)) {
    if (-not (Test-Path $f)) { Fail "required SQL file missing: $f" }
}

# seed-password.local.sql is gitignored by design: data.sql ships no password and
# takes every account's hash from the `app.seed_password_hash` session setting, so a
# known credential can never reach a deployed environment. That means a fresh clone
# has to generate it once -- say so plainly instead of failing later inside psql with
# data.sql's own guard regex, which reads like a corrupt-seed error.
if (-not (Test-Path $SeedPwSql)) {
    Fail @"
$SeedPwSql is missing.

The E2E lane logs in as a seeded account, so the local seed hash must encode the
password the spec uses (E2E_CUSTOMER_PASSWORD, default 'P@ssw0rd'). Generate it with
the application's own encoder and save the printed SET line to that path:

    cd $BackendDir
    .\scripts\seed-hash.ps1 -Password 'P@ssw0rd' | Out-File -Encoding utf8 seed-password.local.sql
"@
}

$env:PGPASSWORD = $DbPassword

function Invoke-Psql([string]$database, [string[]]$psqlArgs, [string]$what) {
    $target = "postgresql://${DbUser}@${DbHost}:${DbPort}/${database}"
    $output = & psql $target -v ON_ERROR_STOP=1 -q @psqlArgs 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        # Print psql's own diagnostic before failing. This used to go to
        # Write-Verbose, which is to say nowhere: a broken seed reported only
        # "applying data.sql failed (psql exit 3)" and the line that actually
        # explained it (`column "max_discount_amount" is of type numeric but
        # expression is of type text` — the OBRS-457 defect) had to be reproduced by
        # hand before anyone could read it. The whole value of failing here rather
        # than inside Flyway is that the reason is on screen.
        Write-Host $output.Trim() -ForegroundColor Red
        Fail "$what failed (psql exit $LASTEXITCODE)."
    }
}

Write-Host "[e2e] rebuilding database '$DbName'..." -ForegroundColor Cyan
# Terminate stragglers first: a leftover connection (a previous run's backend, or an
# open psql) makes DROP DATABASE fail outright rather than wait.
Invoke-Psql 'postgres' @('-c', "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DbName' AND pid <> pg_backend_pid();") 'terminating existing connections'
Invoke-Psql 'postgres' @('-c', "DROP DATABASE IF EXISTS $DbName;") 'dropping database'
Invoke-Psql 'postgres' @('-c', "CREATE DATABASE $DbName;") 'creating database'

Write-Host "[e2e] applying schema.sql..." -ForegroundColor Cyan
Invoke-Psql $DbName @('-f', $SchemaSql) 'applying schema.sql'

# The password SET and data.sql MUST share one psql invocation: `SET` is
# session-scoped, so splitting them silently seeds every account with an empty hash
# and login fails much later with no obvious cause.
Write-Host "[e2e] applying seed password + data.sql..." -ForegroundColor Cyan
Invoke-Psql $DbName @('-f', $SeedPwSql, '-f', $DataSql) 'applying data.sql'

Write-Host "[e2e] applying reschedule fixture..." -ForegroundColor Cyan
Invoke-Psql $DbName @('-f', $FixtureSql) 'applying reschedule-fixture.sql'

Write-Host "[e2e] booting backend on :$BackendPort against '$DbName'..." -ForegroundColor Cyan
$env:JAVA_HOME             = $JavaHome
$env:SERVER_PORT           = $BackendPort
$env:SPRING_DATASOURCE_URL = "jdbc:postgresql://${DbHost}:${DbPort}/${DbName}"
$env:DB_PASSWORD           = $DbPassword          # spring.flyway.password has no default
$env:APP_FRONTEND_URL      = $FrontendUrl         # dev CORS allows exactly this origin

Set-Location $BackendDir
& '.\mvnw.cmd' spring-boot:run '-Dspring-boot.run.profiles=dev,local'
exit $LASTEXITCODE
