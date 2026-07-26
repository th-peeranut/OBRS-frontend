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

    Building the database itself is delegated to OBRS-backend's own
    `scripts/new-local-db.ps1` (OBRS-292) — this script only adds the reschedule
    fixture and boots the app. Two copies of the seed steps in two repos would have
    been one drift away from an E2E lane that seeds differently from every other
    local database.

    The database, the backend port and the frontend origin are all lane-private
    (obrs184qa / 8181 / 4210) so this can run alongside a developer's own
    :8080 + :4200 stack without either disturbing the other.

.NOTES
    Requires `psql` on PATH and a local Postgres superuser connection.
    Requires OBRS-backend checked out as a sibling (override with OBRS_BACKEND_DIR),
    on a revision that has scripts/new-local-db.ps1.
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

# OBRS-732: which fixture this lane seeds is now overridable, because a second lane
# (the real 3-D Secure journey) needs a PAYABLE booking and the reschedule fixture
# deliberately has none — its header explains at length why a zero-net move is what
# keeps `payments` out of it. Merging the two would have meant editing assertions
# that file spends four paragraphs justifying. A relative name is resolved against
# e2e/fixtures/; an absolute path is taken as-is.
$FixtureSql  = if ($env:E2E_FIXTURE_SQL) {
    if ([System.IO.Path]::IsPathRooted($env:E2E_FIXTURE_SQL)) { $env:E2E_FIXTURE_SQL }
    else { Join-Path (Split-Path -Parent $PSScriptRoot) (Join-Path 'fixtures' $env:E2E_FIXTURE_SQL) }
} else {
    Join-Path (Split-Path -Parent $PSScriptRoot) 'fixtures\reschedule-fixture.sql'
}
$NewLocalDb  = Join-Path $BackendDir 'scripts\new-local-db.ps1'

function Fail([string]$msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $BackendDir)) { Fail "OBRS-backend not found at '$BackendDir'. Set OBRS_BACKEND_DIR." }
if (-not (Test-Path $FixtureSql)) { Fail "required SQL file missing: $FixtureSql" }
if (-not (Test-Path $NewLocalDb)) {
    Fail "OBRS-backend/scripts/new-local-db.ps1 not found (OBRS-292). Update '$BackendDir' to a dev that has it."
}

# We boot with the `local` profile, which is where every secret placeholder in
# application-dev.yml gets its value. application-local.yml is gitignored, so a FRESH
# CHECKOUT (a new worktree in particular) does not have one -- and without it the app dies
# ~40s into boot on `Could not resolve placeholder 'JWT_SECRET_KEY'`, buried in a bean
# cascade, which Playwright then reports only as "webServer was not able to start".
# Check for it up front and name the fix instead.
$LocalYml = Join-Path $BackendDir 'src\main\resources\application-local.yml'
if (-not (Test-Path $LocalYml)) {
    Fail @"
$LocalYml is missing.

The E2E backend boots with the 'dev,local' profiles, and 'local' is what supplies the
secrets application-dev.yml leaves as placeholders (JWT key, DB password, mail/SMS/Omise
keys). It is gitignored, so a fresh checkout has none -- copy the template and fill it in:

    cd $BackendDir
    cp src/main/resources/application-local.yml.example src/main/resources/application-local.yml

See OBRS-backend's README, "Local Dev Setup (Secrets)".
"@
}

# Building the database is the BACKEND's job, and it owns the details that go wrong:
# schema.sql -> seed-password + data.sql in ONE psql invocation, terminating stragglers
# before the drop, printing psql's own diagnostic on failure. This script used to carry
# its own copy of all of that; two copies of the same steps in two repos is one drift
# away from an E2E lane that seeds differently from every other local database, which is
# exactly the class of problem this lane exists to avoid. The fixture below is the only
# part that is genuinely ours.
& $NewLocalDb -DbName $DbName -ExtraSql $FixtureSql -DbHost $DbHost -DbPort $DbPort -DbUser $DbUser -DbPassword $DbPassword
if ($LASTEXITCODE -ne 0) { Fail "new-local-db.ps1 failed (exit $LASTEXITCODE) -- see its output above." }

Write-Host "[e2e] booting backend on :$BackendPort against '$DbName'..." -ForegroundColor Cyan
$env:JAVA_HOME             = $JavaHome
$env:SERVER_PORT           = $BackendPort
$env:SPRING_DATASOURCE_URL = "jdbc:postgresql://${DbHost}:${DbPort}/${DbName}"
$env:DB_PASSWORD           = $DbPassword          # spring.flyway.password has no default
$env:APP_FRONTEND_URL      = $FrontendUrl         # dev CORS allows exactly this origin

Set-Location $BackendDir
& '.\mvnw.cmd' spring-boot:run '-Dspring-boot.run.profiles=dev,local'
exit $LASTEXITCODE
