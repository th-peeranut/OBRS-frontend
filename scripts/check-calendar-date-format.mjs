#!/usr/bin/env node
/**
 * OBRS-1815 - pure-node gate on the one rule that makes a date field typeable.
 *
 * PrimeNG resolves a SINGLE format string for both directions:
 * `getDateFormat()` returns `this.dateFormat || getTranslation('dateFormat')`
 * (primeng 21.1.9, `primeng-datepicker.mjs:2820`), and `parseDate` walks that
 * same string. Its `case 'D'` goes through `getName()`, which THROWS on text
 * carrying no day name, and `onUserInput` answers a throw by calling
 * `updateModel(null)` - i.e. it silently empties the box. Nobody types the
 * weekday of a date they are still choosing, so a format containing `D` is a
 * format a person cannot type into.
 *
 * That gives the app one invariant, which it already followed before anyone
 * wrote it down: the weekday-bearing format belongs ONLY to fields the keyboard
 * cannot reach. This gate holds both halves of it.
 *
 *   1. `CALENDAR.dateFormat` in every shipped locale is the GRAMMAR that every
 *      picker without its own `[dateFormat]` parses against => no `D`.
 *   2. A template that binds `[dateFormat]="calendarDateFormat()"` (the grammar
 *      plus `D`) must also set `[readonlyInput]="true"` on the same element.
 *   3. No `dateFormat="..."` literal, which would shadow the locale file
 *      entirely - the defect OBRS-1815 existed to remove (33 of them).
 *
 * Why a gate and not a unit test: 2 and 3 are properties of markup spread over
 * ~26 files, and the failure is invisible in the language the developer uses.
 * `src/app/shared/services/calendar-date-format.spec.ts` proves the mechanism;
 * this proves nobody reintroduced it somewhere else.
 *
 * Exit 0 = pass, 1 = fail. No dependencies, so this runs before `npm ci`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

/** Format tokens only mean something outside `'...'` literals - the zh format
 *  is `yy'年'm'月'd'日'`, and a literal is free to contain any letter. */
function stripLiterals(format) {
  return format.replace(/'[^']*'/g, '');
}

// --- 1. the shipped grammars -----------------------------------------------
const i18nDir = join(repoRoot, 'public', 'i18n');
const locales = readdirSync(i18nDir).filter((name) => name.endsWith('.json'));

if (locales.length === 0) {
  failures.push(`No locale files found in ${relative(repoRoot, i18nDir)} - this gate reads its subject from there.`);
}

for (const locale of locales) {
  const path = join(i18nDir, locale);
  const format = JSON.parse(readFileSync(path, 'utf8'))?.CALENDAR?.dateFormat;

  if (typeof format !== 'string' || format.length === 0) {
    failures.push(`public/i18n/${locale} declares no CALENDAR.dateFormat. Every picker without its own [dateFormat] falls through to it.`);
    continue;
  }
  if (stripLiterals(format).includes('D')) {
    failures.push(
      `public/i18n/${locale} sets CALENDAR.dateFormat to "${format}", which carries the weekday token D. ` +
        `That string is the parse grammar for every typeable picker: a person typing the same date WITHOUT a ` +
        `weekday makes parseDate throw, and onUserInput turns the throw into an empty field (OBRS-1036). ` +
        `Put the weekday in calendarDateFormat() instead - it is this value plus D, and it is for read-only fields.`
    );
  }
}

// --- 2 and 3. the templates -------------------------------------------------
function htmlFilesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...htmlFilesUnder(path));
    } else if (entry.endsWith('.html')) {
      found.push(path);
    }
  }
  return found;
}

/** The open tag of every `<p-datePicker>`, with HTML comments removed first so
 *  a documented counter-example in a comment cannot fail the gate. Attribute
 *  values holding a literal `>` would truncate a tag here; none do today, and a
 *  truncated tag can only cause a FALSE FAILURE that names the file, never a
 *  silent pass. */
function datePickerOpenTags(source) {
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, '');
  return [...withoutComments.matchAll(/<p-datePicker\b[^>]*>/g)].map((m) => m[0]);
}

for (const path of htmlFilesUnder(join(repoRoot, 'src'))) {
  const rel = relative(repoRoot, path).replace(/\\/g, '/');
  for (const tag of datePickerOpenTags(readFileSync(path, 'utf8'))) {
    if (/\bdateFormat="/.test(tag)) {
      failures.push(
        `${rel} hardcodes a dateFormat attribute. PrimeNG resolves ` +
          `\`this.dateFormat || getTranslation('dateFormat')\`, so the literal does not duplicate the locale ` +
          `file - it SHADOWS it, and the field stops following the chosen language (OBRS-1815 removed 33 of these).`
      );
    }
    if (tag.includes('calendarDateFormat()') && !/\[readonlyInput\]="true"/.test(tag)) {
      failures.push(
        `${rel} binds [dateFormat]="calendarDateFormat()" without [readonlyInput]="true" on the same element. ` +
          `calendarDateFormat() carries the weekday token D, which parseDate cannot read back from anything a ` +
          `person types - the field would empty itself on input (OBRS-1036). Either mark it readonly, or drop ` +
          `the binding and let it fall through to CALENDAR.dateFormat.`
      );
    }
  }
}

if (failures.length > 0) {
  console.error('calendar date format gate FAILED:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `calendar date format gate OK: ${locales.length} locale grammars carry no D, and every p-datePicker either ` +
    `falls through to the locale file or is readonly.`
);
