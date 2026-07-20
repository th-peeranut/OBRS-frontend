// Auth split-layout style gate (OBRS-463).
//
// Why this exists: the public auth pages render a two-column shell
// (`<div class="left-section"><img class="bg-img">` + `.right-section`) whose CSS
// they did not own -- they got it by `@import`-ing login.component.scss. OBRS-81
// then redesigned /login into a centered card and deleted those rules. Nothing
// failed: CSS that does not exist raises no error and no warning. The unstyled
// <img> rendered at its intrinsic 1064px inside a 390px `overflow: hidden`
// container and pushed the form to x=627 -- off screen and unreachable by touch.
// Users could not sign up on a phone for weeks, and it took a usability report
// from a real customer ("สมัครสมาชิกไม่ได้", 2026-07-16) to surface it.
//
// The layout now lives in src/styles/_auth-split-layout.scss. This gate fails the
// moment a template uses the shell classes without its stylesheet importing that
// partial -- i.e. it catches the exact silent-unstyling that shipped last time,
// including the "someone copies the shell into a new auth page" variant.
//
// Reads files with fs -- no Angular/Karma bundling -- so it is fast and runs even
// before `npm ci`. Run locally with: npm run test:auth-layout
//
// ASCII-only source.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app', 'modules');

// The partial that owns the shell. A stylesheet may import it directly or inherit
// it transitively through another component stylesheet that imports it.
const PARTIAL = 'styles/auth-split-layout';

// Classes that are meaningless without the shared shell. `.bg-img` is the one that
// actually caused the outage -- with no width rule it renders at intrinsic size.
const SHELL_CLASSES = ['left-section', 'right-section', 'bg-img'];

/** Resolve the @import graph of a component stylesheet, one level of indirection. */
function importsPartial(scssPath, seen = new Set()) {
  if (!existsSync(scssPath) || seen.has(scssPath)) return false;
  seen.add(scssPath);
  const src = readFileSync(scssPath, 'utf8');
  if (src.includes(PARTIAL)) return true;
  // Follow relative @import "..." to sibling component stylesheets.
  for (const m of src.matchAll(/@import\s+["']([^"']+)["']/g)) {
    let target = m[1];
    if (!target.startsWith('.')) continue;
    if (!target.endsWith('.scss')) target += '.scss';
    if (importsPartial(resolve(dirname(scssPath), target), seen)) return true;
  }
  return false;
}

const problems = [];
let checked = 0;

for (const mod of readdirSync(ROOT, { withFileTypes: true })) {
  if (!mod.isDirectory()) continue;
  const dir = join(ROOT, mod.name);
  const html = join(dir, `${mod.name}.component.html`);
  const scss = join(dir, `${mod.name}.component.scss`);
  if (!existsSync(html)) continue;

  const template = readFileSync(html, 'utf8');
  const used = SHELL_CLASSES.filter((c) =>
    new RegExp(`class\\s*=\\s*["'][^"']*\\b${c}\\b`).test(template)
  );
  if (used.length === 0) continue;

  checked++;
  if (!existsSync(scss)) {
    problems.push(
      `${mod.name}: template uses [${used.join(', ')}] but has NO component stylesheet`
    );
  } else if (!importsPartial(scss)) {
    problems.push(
      `${mod.name}: template uses [${used.join(', ')}] but ` +
        `${mod.name}.component.scss does not import "${PARTIAL}" ` +
        `-- those classes will render with NO rules at all`
    );
  }
}

if (checked === 0) {
  console.error(
    `::error::auth layout gate FOUND NOTHING TO CHECK under ${ROOT} -- the gate is a no-op, which is worse than a failure. Verify the path and the class list (OBRS-463).`
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`auth split-layout gate FAILED (${checked} page(s) use the shell):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `::error::An auth page renders the split-layout shell without importing ${PARTIAL} -- ${problems.length} problem(s). The classes would silently have no CSS, which is how the mobile signup outage shipped (OBRS-463).`
  );
  process.exit(1);
}

console.log(
  `auth split-layout gate OK: all ${checked} page(s) using the shell import ${PARTIAL}.`
);
