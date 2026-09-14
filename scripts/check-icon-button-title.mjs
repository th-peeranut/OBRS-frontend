#!/usr/bin/env node
/**
 * OBRS-892 - pure-node gate: every icon-only <button> must carry a hover
 * tooltip, and it must say the SAME thing its screen-reader label says.
 *
 * WHY A GATE. The app labels icon buttons for assistive tech only
 * (`[attr.aria-label]`), so a screen-reader user has always been fine and a
 * sighted mouse user has not: a bare glyph with no hover text, unguessable at
 * `build` vs `checklist`. Measured on `dev` @ 467ccbfa (2026-07-30) when the
 * card was opened: 65 icon-only buttons, 3 with a hover affordance. Measured
 * again on `dev` @ b9c4f7c3 (2026-09-14) before this sweep: 75 and 5. Nobody
 * removed the tooltips - the base grew by 10 buttons in six weeks and every new
 * one arrived without one, because there was nothing to notice. A one-time
 * sweep regresses the same way, which is why the count runs here instead of in
 * somebody's head.
 *
 * WHY NATIVE `[title]` AND NOT A TOOLTIP DIRECTIVE. `docs/design-system.md`
 * (OBRS-98, `.refund-void-info-btn`) locks the mechanism: labels are exposed via
 * `[title]` + `[attr.aria-label]`, "no new tooltip component ... instead of
 * introducing a tooltip directive". PrimeNG's `pTooltip` would be styleable and
 * focus-visible, but adopting it contradicts that decision and needs a
 * design-system amendment first. So this gate also fails a button that reaches
 * for anything else, by requiring the `[title]` binding by name.
 *
 * WHAT THIS GATE DOES *NOT* REQUIRE, AND WHY. The sweep bound every `[title]` to
 * the same expression as that button's `[attr.aria-label]`, which is the right
 * DEFAULT (no new i18n keys, no way for the two to drift). It is deliberately not
 * enforced. Measured 2026-09-14: four buttons already carried a hover title that
 * says MORE than the aria-label, on purpose - the sidebar pin uses its own
 * `*_MENU_TITLE` keys, and the two expense-row buttons explain *why* they are
 * disabled (`FIELD_ROW_IMMUTABLE`) and show nothing when they are not. An
 * equality rule would have forced those back to the poorer text. So the rule is
 * the one that actually regresses on its own: a hover affordance must EXIST, and
 * it must be translatable.
 *
 * WHY A STATIC `title="..."` DOES NOT COUNT. It cannot carry a translation, so a
 * Thai user would read an English tooltip. Measured 2026-09-14: `src/app` has no
 * static `title=` in any template, so nothing is grandfathered in.
 *
 * Self-tests its own matcher before trusting it with the real tree - a scanner
 * that has quietly stopped matching reports "every button has a tooltip", which
 * is the exact green-and-worthless result this file exists to prevent.
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
 * `text` with every element tag removed, leaving only the text between them.
 *
 * Uses `tagEnd` rather than a `<[^>]*>` replace on purpose: a `>` inside an
 * attribute value (`[class.on]="a > b"`) ends that naive match early and leaves
 * the rest of the attribute behind as fake "visible text", which would make this
 * gate skip the button silently instead of checking it.
 */
function stripTags(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '<') {
      const end = tagEnd(text, i);
      if (end !== -1) {
        i = end;
        continue;
      }
    }
    out += text[i];
  }
  return out;
}

/**
 * Every `<button>...</button>` in `text` that is ICON-ONLY: it contains an icon
 * span and no visible text of its own. A button that already shows a word does
 * not need a tooltip to explain itself.
 *
 * Returned as `{ head, line }`, where `head` is the button's OPENING TAG only.
 * The attributes must be read from the opening tag and not from the whole block:
 * a nested element's own `title`/`aria-label` would otherwise be credited to the
 * button, which is how a scanner passes a button that has neither.
 */
export function findIconOnlyButtons(text) {
  const found = [];
  const re = /<button\b[\s\S]*?<\/button>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const block = m[0];
    if (!block.includes(ICON_CLASS)) continue;
    const visible = stripTags(
      block.replace(
        /<span[^>]*\bclass="[^"]*\bmaterial-symbols-outlined\b[^"]*"[^>]*>[\s\S]*?<\/span>/g,
        ''
      )
    ).trim();
    if (visible.length > 0) continue;
    const end = tagEnd(text, m.index);
    if (end === -1) continue;
    found.push({
      head: text.slice(m.index, end + 1),
      line: text.slice(0, m.index).split('\n').length,
    });
  }
  return found;
}

/** The bound value of `name` on an opening tag, or `null` when it is not bound. */
export function boundValue(head, name) {
  const m = new RegExp(`\\[${name.replace('.', '\\.')}\\]="([^"]*)"`).exec(head);
  return m ? m[1].trim() : null;
}

/** True when the tag carries `name` as a STATIC attribute (`name="..."`). */
export function hasStatic(head, name) {
  return new RegExp(`(^|\\s)${name.replace('.', '\\.')}\\s*=\\s*"`).test(head);
}

// --- self-test ---------------------------------------------------------------
const ICON = `<span class="${ICON_CLASS}" [attr.translate]="'no'">edit</span>`;
const SELF_TEST_SCANS = [
  [`<button [title]="a">${ICON}</button>`, 1],
  // A button that already shows a word explains itself; not this gate's business.
  [`<button [title]="a">${ICON}Edit</button>`, 0],
  [`<button>no icon here</button>`, 0],
  [`<button>${ICON}</button><button>${ICON}</button>`, 2],
  // A `>` inside an attribute value must not end the opening tag early, or every
  // attribute after it would be invisible to this scanner.
  [`<button [class.on]="a > b" [title]="t">${ICON}</button>`, 1],
];
for (const [sample, expected] of SELF_TEST_SCANS) {
  const got = findIconOnlyButtons(sample).length;
  if (got !== expected) {
    console.error('check-icon-button-title: the button scanner is broken.');
    console.error(`  expected ${expected}, got ${got} for: ${JSON.stringify(sample)}`);
    console.error('  Fix the scanner - do NOT relax this self-test to make it pass.');
    process.exit(1);
  }
}

const [{ head: SELF_HEAD }] = findIconOnlyButtons(
  `<button [class.on]="a > b" [title]="'K' | translate" [attr.aria-label]="'K' | translate" title="x">${ICON}</button>`
);
const SELF_TEST_ATTRS = [
  [boundValue(SELF_HEAD, 'title'), "'K' | translate"],
  [boundValue(SELF_HEAD, 'attr.aria-label'), "'K' | translate"],
  [boundValue(SELF_HEAD, 'nope'), null],
  [hasStatic(SELF_HEAD, 'title'), true],
  [hasStatic(SELF_HEAD, 'aria-label'), false],
];
for (const [got, expected] of SELF_TEST_ATTRS) {
  if (got !== expected) {
    console.error('check-icon-button-title: the attribute matcher is broken.');
    console.error(`  expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
    console.error('  Fix the matcher - do NOT relax this self-test to make it pass.');
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

const failures = [];
let checked = 0;
let scannedFiles = 0;

for (const file of walk(APP_DIR).filter((f) => f.endsWith('.html'))) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(ICON_CLASS)) continue;
  const rel = relative(root, file).split('\\').join('/');
  let sawButton = false;

  for (const { head, line } of findIconOnlyButtons(text)) {
    sawButton = true;
    checked++;
    const label = boundValue(head, 'attr.aria-label');
    const hover = boundValue(head, 'title') ?? boundValue(head, 'attr.title');

    if (label === null) {
      failures.push(
        `${rel}:${line} is an icon-only button with no [attr.aria-label], so a screen ` +
          `reader announces nothing but the glyph's ligature text. Bind one to a ` +
          `translate pipe, and bind [title] to the same expression.`
      );
      continue;
    }
    if (hover === null) {
      failures.push(
        `${rel}:${line} is an icon-only button with no [title], so a sighted mouse ` +
          `user gets a bare glyph and no way to learn what it does. Add ` +
          `[title]="${label}" - the same expression as its [attr.aria-label].` +
          (hasStatic(head, 'title')
            ? ' A static title="..." does not count: it cannot carry a translation.'
            : '')
      );
      continue;
    }
    // A quoted literal that never reaches the translate pipe is text one locale
    // reads and the other cannot - the failure mode this sweep's AC-2 forbade.
    // An expression with no literal at all (a component property) is fine.
    if (/['"]/.test(hover) && !hover.includes('translate')) {
      failures.push(
        `${rel}:${line} has a hover title with hardcoded text and no translate pipe, ` +
          `so one locale reads the other's language: ${hover}`
      );
    }
  }
  if (sawButton) scannedFiles++;
}

if (failures.length > 0) {
  console.error('Icon-only button tooltip gate FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    `  (${checked - failures.length} of ${checked} icon-only button(s) pass.)`
  );
  process.exit(1);
}

console.log(
  `Icon-only button tooltip gate OK: ${checked} icon-only buttons across ` +
    `${scannedFiles} files name themselves on hover as well as to a screen reader.`
);
