#!/usr/bin/env node
/**
 * OBRS-1202 - pure-node gate: every Material Symbols icon must be marked
 * "do not translate", and in the ONE spelling that survives this codebase.
 *
 * WHY A GATE. Material Symbols is a LIGATURE font: the real text inside the
 * element is the English icon name (`menu`, `flag`, `close`), and the font draws
 * a picture over it. Nothing in the app can see the difference - it renders as an
 * icon on every developer machine, in every unit test, in every screenshot we
 * take. It only breaks on a VISITOR's device, and only when their browser is
 * translating the page: the translator sees genuine English words, replaces them
 * with Thai, and the ligature dies. Measured on prod 2026-08-10 from the owner's
 * phone: the hamburger button rendered the WORD "เมนู" and the report-problem
 * button the WORD "ธง". OBRS-1194 fixed the trigger (`<html lang>` said `en`
 * while the page rendered Thai); this fixes the icons themselves, which stay
 * vulnerable for any visitor who translates the page on purpose - and the owner
 * decided 2026-08-10 NOT to disable browser translation, precisely so that
 * passengers who read neither th/en/zh still can (Burmese/Khmer workers on this
 * route). So a translated page is a supported state, and icons must survive it.
 *
 * WHY `[attr.translate]="'no'"` AND NOT `translate="no"` IN TEMPLATES.
 * Measured 2026-08-11 (karma probe, @ngx-translate/core 15.0.0): `TranslateDirective`
 * has selector `[translate],[ngx-translate]` and an @Input named `translate`, and
 * 139 components import `TranslateModule`. A STATIC `translate="no"` therefore
 * binds the directive with the translation KEY "no", and the directive overwrites
 * the element's text with the missing-key fallback:
 *
 *   <span class="material-symbols-outlined" translate="no">menu</span>
 *     -> rendered: <span ...>nono</span>       (measured, not predicted)
 *
 * The attribute BINDING is not matched by directive selectors, so it puts the real
 * `translate="no"` attribute in the DOM and leaves the text alone (also measured).
 * That is why this gate fails the static form in templates instead of accepting it.
 *
 * `.ts` files are held to a looser rule ON PURPOSE: the two icon sites there build
 * raw HTML strings that Leaflet injects into the DOM itself (map markers). Angular
 * never compiles those, so the plain attribute is the correct spelling there.
 *
 * Self-tests its own matcher before trusting it with the real tree - a scanner
 * that has quietly stopped matching reports "all icons are protected", which is
 * the exact green-and-worthless result this file exists to prevent.
 *
 * Exit 0 = pass, 1 = fail. No dependencies, so this runs before `npm ci`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(root, 'src', 'app');

/** The class that turns element text into a ligature glyph. */
const ICON_CLASS = 'material-symbols-outlined';
/** The only spelling that works inside an Angular template (see header). */
const GUARD_BINDING = `[attr.translate]="'no'"`;
/** The plain HTML attribute - correct only where Angular never compiles the markup. */
const PLAIN_GUARD_RE = /(^|\s)translate\s*=\s*"no"/;

/** true when `index` sits inside an HTML comment. */
function inComment(text, index) {
  const open = text.lastIndexOf('<!--', index);
  if (open === -1) return false;
  const close = text.indexOf('-->', open);
  return close === -1 || close > index;
}

/** End index of the tag opened at `start`, ignoring `>` inside attribute values. */
function tagEnd(text, start) {
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

/**
 * Every element in `text` whose opening tag carries the icon class, as
 * `{ tag, line }`. Commented-out markup is skipped: it renders nothing, and a
 * gate that fails on a comment teaches people to delete the comment.
 */
export function findIconTags(text) {
  const found = [];
  let idx = text.indexOf(ICON_CLASS);
  while (idx !== -1) {
    const next = text.indexOf(ICON_CLASS, idx + ICON_CLASS.length);
    if (!inComment(text, idx)) {
      const open = text.lastIndexOf('<', idx);
      // The `<` must actually open an element tag, and the class must sit inside
      // it: in a .ts file the nearest `<` before a `.material-symbols-outlined`
      // selector string can be a generic or a comparison, and treating that as a
      // tag would report a failure nobody can act on.
      const isTag = open !== -1 && /^<[a-zA-Z][\w-]*[\s>]/.test(text.slice(open, idx));
      const end = isTag ? tagEnd(text, open) : -1;
      if (end !== -1 && end > idx) {
        found.push({
          tag: text.slice(open, end + 1),
          line: text.slice(0, open).split('\n').length,
        });
      }
    }
    idx = next;
  }
  return found;
}

/** `'binding'` | `'plain'` | `'none'` - how (or whether) a tag is guarded. */
export function guardOf(tag) {
  if (tag.includes(GUARD_BINDING)) return 'binding';
  if (PLAIN_GUARD_RE.test(tag)) return 'plain';
  return 'none';
}

// --- self-test ---------------------------------------------------------------
const SELF_TEST_TAGS = [
  [`<span class="${ICON_CLASS}" ${GUARD_BINDING}>menu</span>`, 'binding'],
  [`<span class="${ICON_CLASS} extra" ${GUARD_BINDING} aria-hidden="true">flag</span>`, 'binding'],
  [`<span class="${ICON_CLASS}" translate="no">menu</span>`, 'plain'],
  [`<span class="${ICON_CLASS}">menu</span>`, 'none'],
  [`<span class="${ICON_CLASS}" [attr.translate]="maybe">menu</span>`, 'none'],
  // `>` inside an attribute value must not end the tag early, or the guard that
  // follows it would be invisible to this scanner.
  [`<span class="${ICON_CLASS}" [class.on]="a > b" ${GUARD_BINDING}>menu</span>`, 'binding'],
];
for (const [tag, expected] of SELF_TEST_TAGS) {
  if (guardOf(tag) !== expected) {
    console.error('check-icon-translate: the guard matcher is broken.');
    console.error(`  expected "${expected}", got "${guardOf(tag)}" for: ${tag}`);
    console.error('  Fix the matcher - do NOT relax this self-test to make it pass.');
    process.exit(1);
  }
}

const SELF_TEST_SCANS = [
  [`<span class="${ICON_CLASS}">menu</span>`, 1],
  [`<!-- <span class="${ICON_CLASS}">menu</span> -->`, 0],
  // A mention with no element around it (a CSS rule in a comment, a
  // `querySelector('.material-symbols-outlined')` in code) is not an icon.
  [`.${ICON_CLASS} { font-size: 28px }`, 0],
  [`el.querySelector('.${ICON_CLASS}') as HTMLElement | null;`, 0],
  [`<span\n  class="${ICON_CLASS} x"\n  aria-hidden="true"\n>menu</span>`, 1],
  [`<span class="${ICON_CLASS}">a</span><span class="${ICON_CLASS}">b</span>`, 2],
];
for (const [sample, expected] of SELF_TEST_SCANS) {
  const got = findIconTags(sample).length;
  if (got !== expected) {
    console.error('check-icon-translate: the tag scanner is broken.');
    console.error(`  expected ${expected} tag(s), got ${got} for: ${JSON.stringify(sample)}`);
    console.error('  Fix the scanner - do NOT relax this self-test to make it pass.');
    process.exit(1);
  }
}

// --- the real tree -----------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(APP_DIR);
const templates = files.filter((f) => f.endsWith('.html'));
const sources = files.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

const failures = [];
let guarded = 0;
let scannedFiles = 0;

for (const file of templates) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(ICON_CLASS)) continue;
  const rel = relative(root, file).split('\\').join('/');
  let sawIcon = false;
  for (const { tag, line } of findIconTags(text)) {
    sawIcon = true;
    const guard = guardOf(tag);
    if (guard === 'binding') {
      guarded++;
    } else if (guard === 'plain') {
      failures.push(
        `${rel}:${line} uses the STATIC translate="no". In a template that hands the ` +
          `element to ngx-translate's TranslateDirective, which treats "no" as a ` +
          `translation key and rewrites the icon text to "nono". Use ${GUARD_BINDING}.`
      );
    } else {
      failures.push(
        `${rel}:${line} has a ${ICON_CLASS} icon with no translate guard. Add ` +
          `${GUARD_BINDING} to the tag, or a translated page renders the icon's ` +
          `English ligature text as a Thai word instead of the glyph.`
      );
    }
  }
  if (sawIcon) scannedFiles++;
}

for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(ICON_CLASS)) continue;
  const rel = relative(root, file).split('\\').join('/');
  let sawIcon = false;
  for (const { tag, line } of findIconTags(text)) {
    sawIcon = true;
    if (guardOf(tag) === 'none') {
      failures.push(
        `${rel}:${line} builds a ${ICON_CLASS} icon in code with no translate guard. ` +
          `Markup injected outside Angular (Leaflet divIcon) takes the plain ` +
          `translate="no"; an inline Angular template takes ${GUARD_BINDING}.`
      );
    } else {
      guarded++;
    }
  }
  if (sawIcon) scannedFiles++;
}

if (failures.length > 0) {
  console.error('Material Symbols translate gate FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    `  (${guarded} icon(s) are guarded; the ${failures.length} above are not.)`
  );
  process.exit(1);
}

console.log(
  `Material Symbols translate gate OK: ${guarded} icons across ${scannedFiles} files ` +
    `are marked do-not-translate.`
);
