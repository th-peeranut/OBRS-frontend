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
# JAVA_HOME is deliberately NOT a configuration line any more (OBRS-1162) - it is derived
# from OBRS-backend's own <java.version> below, once $BackendDir has been validated.

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

# ── JDK (OBRS-1162) ────────────────────────────────────────────────────────────
# This used to be a one-line default in the configuration block above:
#
#     $JavaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Java\jdk-21.0.11' }
#
# It went stale the day OBRS-921 moved OBRS-backend to <java.version>25</java.version>,
# and stale in the worst available way: jdk-21.0.11 IS installed on this machine, so the
# lane did not stop with "JDK not found" - it handed the backend a Java 21 toolchain for a
# pom asking for 25 and the failure surfaced as a compiler error about source code that
# was not the problem. playwright.obrs577.config.ts had already hit this and worked around
# it by writing a SECOND absolute path (jdk-25.0.3 - a PATCH-level pin), which is how one
# stale default became two pins rotting on different clocks.
#
# Derived from the pom of the repo this script BOOTS ($BackendDir), never from this one:
# OBRS-frontend has no pom and no opinion about Java. Same shape as OBRS-backend's
# scripts/seed-hash.ps1 (OBRS-1158); that duplication is deliberate for the reason its
# header gives - the two live in different repositories with no shared module path, and a
# helper hoisted into a third home would have an owner that neither repo builds or tests.
function Get-PomJavaMajor {
    param([Parameter(Mandatory)][string]$Repo)
    $pom = Join-Path $Repo 'pom.xml'
    if (-not (Test-Path -LiteralPath $pom)) {
        Fail "no pom.xml at '$pom' - cannot tell which Java version the backend wants."
    }
    # Read with a regex, not [xml]/XPath: pom.xml carries a default namespace, so an XPath
    # needs namespace plumbing to fetch one integer and breaks silently if it changes.
    $m = [regex]::Match((Get-Content -LiteralPath $pom -Raw),
                        '<java\.version>\s*(\d+)\s*</java\.version>')
    if (-not $m.Success) { Fail "'$pom' has no <java.version> - refusing to guess a JDK." }
    return [int]$m.Groups[1].Value
}

function Resolve-JdkHome {
    param([Parameter(Mandatory)][int]$Major)
    $javaRoot = 'C:\Program Files\Java'

    # A directory is only a candidate if it carries a COMPILER: spring-boot:run compiles
    # before it runs, so a JRE (or a half-removed install) has the right name and still
    # cannot start the backend.
    $installed = @()
    if (Test-Path -LiteralPath $javaRoot) {
        $installed = @(Get-ChildItem -LiteralPath $javaRoot -Directory -ErrorAction SilentlyContinue |
            ForEach-Object {
                $v = [regex]::Match($_.Name, '^jdk-(\d+)')
                if ($v.Success) {
                    [pscustomobject]@{ Path = $_.FullName; Major = [int]$v.Groups[1].Value; Name = $_.Name }
                }
            } | Where-Object { Test-Path -LiteralPath (Join-Path $_.Path 'bin\javac.exe') })
    }

    # Newest patch level of the REQUESTED major, ordered numerically - a string sort puts
    # jdk-25.0.3 above jdk-25.0.10.
    $match = $installed | Where-Object { $_.Major -eq $Major } | Sort-Object {
        $parts = @(($_.Name -replace '^jdk-', '') -split '[^\d]+' | Where-Object { $_ } | Select-Object -First 4)
        while ($parts.Count -lt 4) { $parts += '0' }
        [version]($parts -join '.')
    } -Descending | Select-Object -First 1
    if ($match) { return $match.Path }

    # Fail closed, naming the major that is missing. Never fall back to another major -
    # that is precisely what turned a one-line "install JDK N" into the compiler error
    # this card exists to stop.
    $have = if ($installed) { ($installed.Name | Sort-Object) -join ', ' } else { '(none)' }
    Fail "OBRS-backend's pom.xml asks for Java $Major, but no JDK $Major with bin\javac.exe is installed under '$javaRoot'. Found: $have"
}

$JavaMajor = Get-PomJavaMajor -Repo $BackendDir
if ($env:JAVA_HOME) {
    # An ambient JAVA_HOME is still honoured - a JDK outside C:\Program Files\Java has to
    # remain reachable - but it is CHECKED first. Honouring it blindly would reopen this
    # card by a shorter route: a shell that exports JDK 17 would compile against 17 for a
    # pom asking for $JavaMajor, and the error would once again point at the source code.
    $javacExe = Join-Path $env:JAVA_HOME 'bin\javac.exe'
    if (-not (Test-Path -LiteralPath $javacExe)) {
        Fail "JAVA_HOME='$env:JAVA_HOME' has no bin\javac.exe. Unset JAVA_HOME and this script derives the JDK from OBRS-backend's pom.xml (which wants Java $JavaMajor)."
    }
    $ambient = [regex]::Match((& $javacExe -version 2>&1 | Out-String), 'javac\s+(\d+)')
    if (-not $ambient.Success) {
        Fail "could not read a version out of '$javacExe'. Unset JAVA_HOME and this script derives the JDK from OBRS-backend's pom.xml (which wants Java $JavaMajor)."
    }
    if ([int]$ambient.Groups[1].Value -ne $JavaMajor) {
        Fail "JAVA_HOME='$env:JAVA_HOME' is Java $($ambient.Groups[1].Value), but OBRS-backend's pom.xml asks for Java $JavaMajor. Unset JAVA_HOME (this script finds the right JDK by itself) or point it at a JDK $JavaMajor."
    }
    $JavaHome = $env:JAVA_HOME
    Write-Host "[e2e] JAVA_HOME from environment: $JavaHome (javac $JavaMajor, matches pom)" -ForegroundColor DarkGray
} else {
    $JavaHome = Resolve-JdkHome -Major $JavaMajor
    Write-Host "[e2e] JDK derived from <java.version>$JavaMajor in $BackendDir\pom.xml -> $JavaHome" -ForegroundColor DarkGray
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
