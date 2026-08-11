// OBRS-1246 — a page that asks for the station roster must also be able to say
// that the ask failed.
//
// OBRS-1222 turned OFF the global error modal for this one effect
// (`getAll({ skipLoadingAlert: true, skipErrorAlert: true })`) and put an inline
// surface in its place. The surface reached 2 of the 6 pages that dispatch the
// fetch. The other 4 did not become quieter — they became SILENT: origin and
// destination render as `-` with nothing on screen saying why, and on /e-ticket
// that is a ticket the customer hands over at the door.
//
// Nobody removed those 4 surfaces; they were never added, because the count that
// should have caught it was done by hand. A hand count is exactly what fails
// when the 7th page arrives, so it is done here instead, on every push.
//
// What this gate enforces, in both directions:
//
//   1. Every file that DISPATCHES `invokeGetAllProvinceWithStationApi()` belongs
//      to a page whose templates contain `<app-station-load-error>`.
//   2. `station.effect.ts` still passes `skipErrorAlert: true`. Half the pair on
//      its own is a lie in one direction or the other — the flag without the
//      surface is silence (this card), the surface without the flag is the modal
//      OBRS-642 removed sitting on top of it.
//
// It fails LOUD rather than quiet: an unrecognised dispatch shape, a renamed
// action, or zero dispatchers found are all errors, because each one would
// otherwise turn this file into a green no-op — the same failure mode as the
// hand count it replaces.
//
// Run: node scripts/check-station-load-surface.mjs   (wired into `npm test`
// lanes the same way as its neighbours in this folder)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(root, 'src', 'app');
const MODULES_PREFIX = 'src/app/modules/';

const ACTION = 'invokeGetAllProvinceWithStationApi';
const SURFACE_TAG = 'app-station-load-error';
const EFFECT_FILE = 'src/app/shared/stores/station/station.effect.ts';
const SKIP_ERROR_ALERT = 'skipErrorAlert: true';

// The store folder DEFINES the action (createAction / ofType / on(...)); none of
// those are dispatches. The surface component itself dispatches the action from
// its retry button — requiring the surface to contain the surface is circular.
const NOT_A_PAGE = [
  'src/app/shared/stores/station/',
  'src/app/shared/components/station-load-error/',
];

/** `store.dispatch(invokeGetAllProvinceWithStationApi())` — the only shape in use. */
const DISPATCH_RE = new RegExp(`dispatch\\(\\s*${ACTION}\\s*\\(`);
/** Any call of the action at all, so an unrecognised shape can be reported. */
const ANY_CALL_RE = new RegExp(`\\b${ACTION}\\s*\\(`);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const posix = (abs) => relative(root, abs).split('\\').join('/');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// --- self-test ---------------------------------------------------------------
// A checker whose matcher has quietly stopped matching reports "all pages have a
// surface" — the exact green-and-worthless result this file exists to prevent.
// So the matcher is exercised against known answers before it is trusted with
// the real tree.
const SELF_TEST = [
  [`this.store.dispatch(${ACTION}());`, true],
  [`    this.store.dispatch(  ${ACTION}()  );`, true],
  [`import { ${ACTION} } from '../../shared/stores/station/station.action';`, false],
  [`export const ${ACTION} = createAction('[Station] invoke');`, false],
  [`ofType(${ACTION}),`, false],
  [`on(${ACTION}, () => stationLoadStatusInitialState),`, false],
];
for (const [sample, expected] of SELF_TEST) {
  if (DISPATCH_RE.test(sample) !== expected) {
    console.error('check-station-load-surface: the dispatch matcher is broken.');
    console.error(`  expected ${expected} for: ${sample}`);
    console.error('  Fix the regex — do NOT relax this self-test to make it pass.');
    process.exit(1);
  }
}

// --- the real tree -----------------------------------------------------------
const files = walk(APP_DIR).map(posix);
const sources = files.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

const errors = [];
const dispatchers = [];

for (const file of sources) {
  const text = read(file);
  if (!ANY_CALL_RE.test(text)) continue;
  if (NOT_A_PAGE.some((prefix) => file.startsWith(prefix))) continue;

  if (!DISPATCH_RE.test(text)) {
    errors.push(
      `${file}\n    calls ${ACTION}() in a shape this gate does not recognise (not ` +
        `\`dispatch(${ACTION}())\`).\n    Teach the gate the new shape — a call it ` +
        `cannot see is a page it cannot check.`
    );
    continue;
  }
  dispatchers.push(file);
}

if (dispatchers.length === 0) {
  console.error('check-station-load-surface: found NO dispatcher of ' + ACTION + '.');
  console.error('  Either the action was renamed or the walk is looking in the wrong place.');
  console.error('  Zero findings is not a pass here — it means this gate checks nothing.');
  process.exit(1);
}

// A dispatcher outside src/app/modules/ has no page directory to search for the
// surface. Guessing one would be worse than saying so.
const pages = new Map();
for (const file of dispatchers) {
  if (!file.startsWith(MODULES_PREFIX)) {
    errors.push(
      `${file}\n    dispatches the roster fetch from outside ${MODULES_PREFIX}, so this ` +
        `gate cannot tell which page owns it.\n    Either move it under a module or add ` +
        `it to NOT_A_PAGE with a written reason.`
    );
    continue;
  }
  const page = MODULES_PREFIX + file.slice(MODULES_PREFIX.length).split('/')[0];
  if (!pages.has(page)) pages.set(page, []);
  pages.get(page).push(file);
}

const surfaced = [];
for (const [page, owners] of [...pages].sort()) {
  const templates = files.filter((f) => f.startsWith(page + '/') && f.endsWith('.html'));
  const withSurface = templates.filter((f) => read(f).includes(SURFACE_TAG));
  if (withSurface.length === 0) {
    errors.push(
      `${page}\n    dispatches ${ACTION}() (${owners.join(', ')})\n    but no template ` +
        `under it renders <${SURFACE_TAG}>.\n    After OBRS-1222 that page shows blank ` +
        `stations with nothing on screen saying why.\n    Add <${SURFACE_TAG}> to the ` +
        `page template — and read OBRS-1246's note on /e-ticket first if the page has a\n` +
        `    second source for the names, because there the bare component over-fires.`
    );
    continue;
  }
  surfaced.push(`${page} → ${withSurface.map((f) => f.slice(page.length + 1)).join(', ')}`);
}

// AC3 of OBRS-1246: the inline surface only replaces the modal for as long as the
// modal stays off. Re-adding `skipErrorAlert: false` (or dropping the option) puts
// the OBRS-642 modal back on top of every surface this gate just verified.
const effect = read(EFFECT_FILE);
if (!effect.includes(SKIP_ERROR_ALERT)) {
  errors.push(
    `${EFFECT_FILE}\n    no longer passes \`${SKIP_ERROR_ALERT}\`.\n    That re-arms the ` +
      `global error modal OBRS-642 removed, on top of the inline surface.\n    If the ` +
      `modal is genuinely wanted back, delete this check and the surfaces together.`
  );
}

if (errors.length) {
  console.error('Station-load failure surface gate (OBRS-1246) FAILED:\n');
  for (const error of errors) console.error('  ' + error + '\n');
  process.exit(1);
}

console.log(
  `Station-load failure surface: ${dispatchers.length} dispatcher(s) across ` +
    `${pages.size} page(s), every one surfaced.`
);
for (const line of surfaced) console.log(`  ${line}`);
console.log(`  ${EFFECT_FILE} still passes ${SKIP_ERROR_ALERT}.`);
