#!/usr/bin/env node
/**
 * OBRS-1194 - pure-node gate: src/index.html must declare the language the app
 * actually renders, and must not ship the internal project code as its tab title.
 *
 * Why this is a GATE and not a comment. `<html lang>` has no runtime effect that any
 * test can see: nothing throws, no unit test can observe it, the app looks identical in
 * every browser the team develops in. It is only wrong on a VISITOR's device, and only
 * once - and when it is wrong the whole page is wrong at once.
 *
 * Measured 2026-08-10 on prod (https://nj-phuyaipu.com): the served i18n bundle held the
 * correct Thai and /api/stops returned the correct stop names, yet the owner's phone
 * showed "ชุชาก" for หนองชาก, "โดยทั่วไป" for ผู้ใหญ่, and the WORD "เมนู"/"ธง" where the
 * hamburger and report-problem icons belong. Nothing on the server produced any of it:
 * the page declared `lang="en"` while rendering Thai, so the browser ran its
 * English->Thai translator across Thai text, and across the Material Symbols ligatures
 * whose element text is the literal English icon name.
 *
 * Exit 0 = pass, 1 = fail. No dependencies, so this runs before `npm ci`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(repoRoot, 'src', 'index.html');

/**
 * The language the app falls back to when nothing has been persisted. Read from the
 * source rather than hardcoded here, so that changing the app default and forgetting
 * index.html fails THIS gate instead of shipping the same mismatch under a new value.
 */
function readAppDefaultLanguage() {
  const servicePath = join(
    repoRoot,
    'src',
    'app',
    'shared',
    'services',
    'language.service.ts'
  );
  const source = readFileSync(servicePath, 'utf8');
  const match = source.match(/DEFAULT_LANGUAGE\s*=\s*'([a-zA-Z-]+)'/);
  if (!match) {
    throw new Error(
      `Could not read DEFAULT_LANGUAGE from ${servicePath} - this gate compares index.html against it.`
    );
  }
  return match[1];
}

const html = readFileSync(indexPath, 'utf8');
const expectedLang = readAppDefaultLanguage();
const failures = [];

const langMatch = html.match(/<html[^>]*\slang="([^"]*)"/i);
if (!langMatch) {
  failures.push('src/index.html has no <html lang="..."> attribute at all.');
} else if (langMatch[1] !== expectedLang) {
  failures.push(
    `src/index.html declares <html lang="${langMatch[1]}"> but the app renders "${expectedLang}" by default ` +
      `(DEFAULT_LANGUAGE in language.service.ts). A browser that believes the declaration will offer - and on ` +
      `an "always translate" setting silently RUN - a translation of text that is already in the reader's ` +
      `language, which is what garbled prod on 2026-08-10.`
  );
}

const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
const title = titleMatch ? titleMatch[1].trim() : '';
if (!title) {
  failures.push('src/index.html has no non-empty <title> - every tab and bookmark would be unnamed.');
} else if (/^obrs$/i.test(title)) {
  failures.push(
    `src/index.html still uses the internal project code as its tab title ("${title}"). ` +
      `Customers see this in tabs, bookmarks and shared links; it must name the business.`
  );
}

if (failures.length > 0) {
  console.error('index.html lang/title gate FAILED:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `index.html lang/title gate OK: <html lang="${expectedLang}"> matches DEFAULT_LANGUAGE, title is "${title}".`
);
