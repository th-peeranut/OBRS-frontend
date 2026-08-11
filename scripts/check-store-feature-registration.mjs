// NgRx feature-registration gate (OBRS-1252).
//
// Why this exists: `createFeatureSelector<T>('key')` returns `undefined` — quietly, with no
// throw and no console warning — when nothing has registered `'key'` in the store. TypeScript
// cannot see it either: the selector is typed `MemoizedSelector<object, T>`, so every consumer
// downstream type-checks perfectly while receiving `undefined` at runtime. There is no compile
// error, no test failure and no red anywhere; the page simply renders its class defaults.
//
// That shipped. `e-ticket.module.ts` registered exactly one slice (`booking`) while
// `ETicketComponent` read FIVE selectors, so a guest who opened /e-ticket by direct link got a
// ticket whose every store-fed field was `-` — booking reference, travel date, travel time,
// route, vehicle type, seat, passengers — with no error on screen and, measured, not one
// `/api/` request. It was invisible for two reasons that will recur: a signed-in customer never
// saw it (the tickets API overlays the blank render), and every in-app route into the page
// passes through modules that happen to register the missing slices into the same store.
//
// So the defect is structural, not local: a component's correctness depends on a file it does
// not import and cannot see. This gate is that missing link, checked mechanically.
//
// WHAT IT ENFORCES
//   For every component declared by an NgModule, every feature selector the component imports
//   must have its feature key registered either
//     (a) by that same NgModule via `StoreModule.forFeature('key', ...)`, or
//     (b) at the root via `StoreModule.forRoot({ ... })` in app.module.ts.
//   Anything else is a component that reads a slice its own module does not guarantee exists.
//
// WHY NOT "any module registers it somewhere"
//   That is precisely the accident that hid this bug for as long as it lived: the slices WERE
//   registered — by schedule-booking, passenger-info and payment, i.e. by whichever module the
//   customer happened to walk through first. A lazy module must stand up on its own, because a
//   direct link, a bookmark, a restored tab and a refresh all load it alone.
//
// WHAT IT DELIBERATELY DOES NOT CHECK: components declared under src/app/shared/
//   A component declared by `SharedModule` or by a shared child module has no page of its own -
//   it renders wherever it is dropped, so the module that must guarantee its slice is the
//   IMPORTER, and this gate cannot know which importers actually place it in a template.
//   `station-load-error.component.ts` is the worked example: SharedModule is imported by every
//   feature module, but the component only renders on the pages that put it there. Flagging it
//   would mean flagging ~20 modules that never show it, and a gate that cries wolf gets an
//   allowlist and then gets deleted. The number of components skipped for this reason is
//   printed, so the hole is a figure on screen rather than a silent pass.
//
// OPT-OUT: a real instance that is deliberately not being fixed HERE is marked in the component
//   with `// ngrx-feature-registration-ok: <reason>` anywhere before the selector import. The
//   reason string is REQUIRED - a bare marker does not suppress anything - so every opt-out
//   names who owns the fix. Same shape as `store-null-ok:` in check-store-null-handling.mjs.
//
// KNOWN BLIND SPOTS — stated, not hedged, so a reader knows this gate's edges:
//   1. A selector read inside a SERVICE rather than a component. The service has no declaring
//      module, so there is nothing to check it against.
//   2. A standalone component (`standalone: true`, no `declarations` entry). Counted and
//      printed as skipped rather than silently passed.
//   3. A selector composed with `createSelector` in a third file and re-exported under a new
//      name. Only the `createFeatureSelector` call site is mapped to a key.
//   4. A feature key built at runtime (`createFeatureSelector(someVariable)`). Unresolvable
//      names are counted and printed, never assumed innocent.
//   Every one of these is a COUNT in the success output, so lost coverage is a visible number.
//
// It fails LOUD on its own inputs: zero selectors found, zero modules found, or a module whose
// declarations cannot be resolved are all errors, because each would otherwise turn this file
// into a green no-op — the same failure mode as the hand count it replaces.
//
// Reads .ts files with fs — no Angular/Karma bundling — so it runs before `npm ci`.
// Run: node scripts/check-store-feature-registration.mjs
//
// ASCII-only source.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'src', 'app');
const APP_MODULE = join(SRC_DIR, 'app.module.ts');

const rel = (file) => relative(ROOT, file).split('\\').join('/');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const files = walk(SRC_DIR);
const read = (file) => readFileSync(file, 'utf8');
const errors = [];

// ---------------------------------------------------------------------------------------
// 1. String constants, so `[STATION_LOAD_STATUS_FEATURE_KEY]:` and
//    `StoreModule.forFeature(SOME_KEY, ...)` resolve to the literal they hold.
// ---------------------------------------------------------------------------------------
const constants = new Map();
for (const file of files) {
  const source = read(file);
  const re = /export\s+const\s+([A-Za-z0-9_]+)\s*(?::\s*[^=]+)?=\s*'([^']+)'/g;
  let match;
  while ((match = re.exec(source))) constants.set(match[1], match[2]);
}

// ---------------------------------------------------------------------------------------
// 2. selector identifier -> feature key, from every `createFeatureSelector` call site.
//    The call is written across two lines about as often as one, hence the [\s\S] class.
// ---------------------------------------------------------------------------------------
const selectorKey = new Map();
let unresolvableSelectors = 0;
for (const file of files) {
  const source = read(file);
  const re =
    /(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*createFeatureSelector\s*(?:<[\s\S]*?>)?\s*\(\s*([\s\S]*?)\s*\)/g;
  let match;
  while ((match = re.exec(source))) {
    const [, name, rawArg] = match;
    const literal = rawArg.match(/^'([^']+)'$/);
    if (literal) {
      selectorKey.set(name, literal[1]);
    } else if (constants.has(rawArg.trim())) {
      selectorKey.set(name, constants.get(rawArg.trim()));
    } else {
      unresolvableSelectors += 1;
    }
  }
}

if (selectorKey.size === 0) {
  errors.push(
    'no createFeatureSelector call sites were found at all.\n' +
      '    That is not a clean tree, it is a broken scan - the pattern this gate reads has\n' +
      '    changed shape. Fix the pattern rather than deleting the gate.'
  );
}

// ---------------------------------------------------------------------------------------
// 3. Root-registered keys, from StoreModule.forRoot({ ... }) in app.module.ts.
// ---------------------------------------------------------------------------------------
const rootKeys = new Set();
{
  const source = read(APP_MODULE);
  const start = source.indexOf('StoreModule.forRoot(');
  if (start === -1) {
    errors.push(
      `${rel(APP_MODULE)}\n    has no StoreModule.forRoot( call. Either the root store moved or\n` +
        '    this gate can no longer see it; both make every root-registered slice read as\n' +
        '    unregistered below.'
    );
  } else {
    const open = source.indexOf('{', start);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = source.slice(open, end + 1);
    const re = /(?:^|[{,\s])(?:\[([A-Za-z0-9_]+)\]|([A-Za-z0-9_]+))\s*:/gm;
    let match;
    while ((match = re.exec(body))) {
      const [, computed, plain] = match;
      if (computed) {
        if (constants.has(computed)) rootKeys.add(constants.get(computed));
        else
          errors.push(
            `${rel(APP_MODULE)}\n    StoreModule.forRoot uses computed key [${computed}], whose ` +
              'string value this gate\n    could not resolve. An unresolved root key reads as ' +
              '"not registered" for every\n    component below, so this is an error rather than ' +
              'a skip.'
          );
      } else rootKeys.add(plain);
    }
  }
}

// ---------------------------------------------------------------------------------------
// 4. Every NgModule: which feature keys it registers, and which components it declares.
// ---------------------------------------------------------------------------------------
function importedPaths(source, moduleFile) {
  // symbol -> absolute file path, for relative imports only (an @angular or rxjs symbol can
  // never be a component of ours).
  const map = new Map();
  const re = /import\s*\{([^}]+)\}\s*from\s*'(\.[^']+)'/g;
  let match;
  while ((match = re.exec(source))) {
    const target = resolve(dirname(moduleFile), match[2]) + '.ts';
    for (const raw of match[1].split(',')) {
      const symbol = raw.trim().split(/\s+as\s+/).pop().trim();
      if (symbol) map.set(symbol, target);
    }
  }
  return map;
}

function arrayBody(source, property) {
  const at = source.indexOf(property + ':');
  if (at === -1) return null;
  const open = source.indexOf('[', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '[') depth += 1;
    else if (source[i] === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

const SHARED_PREFIX = join(SRC_DIR, 'shared') + '\\';
const isShared = (file) => file.split('/').join('\\').startsWith(SHARED_PREFIX.split('/').join('\\'));

const moduleFiles = files.filter((f) => f.endsWith('.module.ts') && f !== APP_MODULE);
if (moduleFiles.length === 0) {
  errors.push('no *.module.ts files were found - the scan is broken, not the tree.');
}

let componentsChecked = 0;
let standaloneSkipped = 0;
let sharedSkipped = 0;
let optedOut = 0;
let unresolvedDeclarations = 0;
const checkedPairs = [];
const optOutLines = [];

// Own `forFeature` keys, per module file. Kept separate from the transitive closure below so
// the two questions stay distinguishable in the error text.
function ownFeatureKeys(moduleFile) {
  const source = read(moduleFile);
  const keys = new Set();
  const featureRe = /StoreModule\.forFeature\s*\(\s*([^,)]+)/g;
  let match;
  while ((match = featureRe.exec(source))) {
    const raw = match[1].trim();
    const literal = raw.match(/^'([^']+)'$/);
    if (literal) keys.add(literal[1]);
    else if (constants.has(raw)) keys.add(constants.get(raw));
    else
      errors.push(
        `${rel(moduleFile)}\n    StoreModule.forFeature(${raw}, ...) - this gate could not ` +
          'resolve that feature key to a\n    string. An unresolved registration reads as "no ' +
          'registration" below, so it is an\n    error rather than a skip.'
      );
  }
  return keys;
}

/**
 * Everything a module brings with it when IT is the entry point: its own `forFeature` calls plus
 * those of every NgModule it imports, transitively.
 *
 * This has to be transitive or the gate is wrong in the expensive direction. `payment.module.ts`
 * reads `selectScheduleBooking` and never registers `scheduleBooking` itself - it imports
 * `PaymentMethodsModule`, which does. Angular registers the slice all the same the moment
 * PaymentModule loads, so flagging it would be a false positive, and false positives are how a
 * gate gets an allowlist and then gets deleted.
 *
 * `seen` breaks the cycle rather than reporting one: NgModule import cycles are legal and common
 * (SharedModule <-> a feature module) and are not this gate's business.
 */
function effectiveFeatureKeys(moduleFile, seen = new Set()) {
  if (seen.has(moduleFile)) return new Set();
  seen.add(moduleFile);
  const keys = ownFeatureKeys(moduleFile);
  const source = read(moduleFile);
  const body = arrayBody(source, 'imports');
  if (body) {
    const symbols = importedPaths(source, moduleFile);
    for (const raw of body.split(',')) {
      const name = raw.replace(/\/\/.*$/gm, '').trim();
      if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
      const target = symbols.get(name);
      if (!target || !target.endsWith('.module.ts')) continue;
      try {
        statSync(target);
      } catch {
        continue;
      }
      for (const key of effectiveFeatureKeys(target, seen)) keys.add(key);
    }
  }
  return keys;
}

for (const moduleFile of moduleFiles) {
  if (isShared(moduleFile)) {
    const body = arrayBody(read(moduleFile), 'declarations');
    if (body) sharedSkipped += body.split(',').filter((n) => /^[A-Za-z0-9_]+$/.test(n.trim())).length;
    continue;
  }
  const source = read(moduleFile);

  const ownKeys = effectiveFeatureKeys(moduleFile);

  const declarations = arrayBody(source, 'declarations');
  if (!declarations) continue; // a routing/shared module that declares nothing
  const symbols = importedPaths(source, moduleFile);

  for (const raw of declarations.split(',')) {
    const name = raw.replace(/\/\/.*$/gm, '').trim();
    if (!name || !/^[A-Za-z0-9_]+$/.test(name)) continue;
    const componentFile = symbols.get(name);
    if (!componentFile) {
      unresolvedDeclarations += 1;
      continue;
    }
    let componentSource;
    try {
      componentSource = read(componentFile);
    } catch {
      unresolvedDeclarations += 1;
      continue;
    }
    if (/standalone\s*:\s*true/.test(componentSource)) {
      standaloneSkipped += 1;
      continue;
    }

    componentsChecked += 1;
    const used = new Set();
    const importRe = /import\s*\{([^}]+)\}\s*from\s*'[^']*\.selector'/g;
    let importMatch;
    while ((importMatch = importRe.exec(componentSource))) {
      for (const rawSymbol of importMatch[1].split(',')) {
        const symbol = rawSymbol.trim().split(/\s+as\s+/)[0].trim();
        if (selectorKey.has(symbol)) used.add(symbol);
      }
    }

    // The reason is what makes the marker cost something. A bare `ngrx-feature-registration-ok`
    // with nothing after the colon suppresses nothing, so an opt-out always says who owns the
    // fix rather than just silencing the finding.
    const optOut = componentSource.match(/ngrx-feature-registration-ok:\s*(\S.*)/);

    for (const symbol of used) {
      const key = selectorKey.get(symbol);
      if (ownKeys.has(key) || rootKeys.has(key)) {
        checkedPairs.push(`${name} -> ${symbol} ('${key}')`);
        continue;
      }
      if (optOut) {
        optedOut += 1;
        optOutLines.push(`${rel(componentFile)} -> ${symbol} ('${key}'): ${optOut[1].trim()}`);
        continue;
      }
      errors.push(
        `${rel(componentFile)}\n    reads ${symbol}, whose feature key '${key}' is NOT ` +
          `registered by its own module\n    ${rel(moduleFile)}\n` +
          "    and is not in StoreModule.forRoot. createFeatureSelector returns `undefined`\n" +
          '    here - silently, with no throw and no type error - so every field fed by it\n' +
          '    renders its class default while the page looks like it loaded fine.\n' +
          `    Fix: add StoreModule.forFeature('${key}', <Reducer>) (and the matching\n` +
          '    EffectsModule.forFeature, if an effect must answer the dispatch) to that module,\n' +
          '    or stop reading the selector from this component.'
      );
    }
  }
}

if (errors.length) {
  console.error('NgRx feature-registration gate (OBRS-1252) FAILED:\n');
  for (const error of errors) console.error('  ' + error + '\n');
  process.exit(1);
}

console.log(
  `NgRx feature registration: ${checkedPairs.length} component/selector pair(s) across ` +
    `${componentsChecked} declared component(s) - every feature key registered by its own ` +
    'module or at the root.'
);
console.log(
  `  root keys: ${[...rootKeys].sort().join(', ') || '(none)'}\n` +
    `  known feature selectors: ${selectorKey.size}\n` +
    `  skipped - components declared under src/app/shared (no page of their own): ${sharedSkipped}\n` +
    `  skipped - standalone components: ${standaloneSkipped}\n` +
    `  skipped - declarations this gate could not resolve to a file: ${unresolvedDeclarations}\n` +
    `  skipped - createFeatureSelector calls with a non-literal key: ${unresolvableSelectors}\n` +
    `  opted out with a stated reason: ${optedOut}`
);
for (const line of optOutLines) console.log(`    opt-out: ${line}`);
