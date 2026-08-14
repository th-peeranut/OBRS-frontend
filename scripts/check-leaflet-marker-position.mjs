// Leaflet marker `position` gate (OBRS-1335).
//
// Why this exists: Leaflet places every marker by writing `translate3d()` onto an
// element it has already set `position: absolute` on. A component stylesheet that
// re-declares `position` for the same class through `:host ::ng-deep` outweighs
// Leaflet's single-class rule and wins. With `position: relative` the marker
// rejoins the marker pane's normal flow, so Leaflet's translate becomes an offset
// from where FLOW put it -- every marker after the first is pushed down by the
// height of the ones before it. Measured on SIT 2026-08-14: fleet-map pin N was
// 18px * N too low, and at a fleet-wide zoom that is tens of kilometres, so the
// pins were drawn out in the Gulf of Thailand while the coordinates were fine.
//
// Nothing caught it. The unit specs assert marker CONTENT and call counts, and
// `ng test` runs in a browser that never had to lay these panes out at a real
// size, so a wrong `position` is invisible to every existing test.
//
// This gate reads the `className` given to each `L.divIcon(...)` and fails if any
// stylesheet declares `position` for that class as anything but `absolute`.
//
// Reads files with fs -- no Angular/Karma bundling. Run locally with:
//   npm run test:marker-position
//
// ASCII-only source.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');

/** Every .ts / .scss file under ROOT. */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts') || e.name.endsWith('.scss')) out.push(p);
  }
  return out;
}

if (!existsSync(ROOT) || !statSync(ROOT).isDirectory()) {
  console.error(`::error::marker position gate: ${ROOT} is not a directory (OBRS-1335).`);
  process.exit(1);
}

const files = walk(ROOT);

// Class names handed to L.divIcon. The value can be a ternary
// (`stale ? 'a is-stale' : 'a is-live'`), so take every string literal on the
// line and split it on whitespace.
const markerClasses = new Set();
for (const f of files.filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes('divIcon')) continue;
  for (const m of src.matchAll(/className:\s*([^\n]*)/g)) {
    for (const lit of m[1].matchAll(/['"]([^'"]*)['"]/g)) {
      for (const token of lit[1].split(/\s+/)) {
        if (/^[a-z][\w-]*$/.test(token)) markerClasses.add(token);
      }
    }
  }
}

/** The declarations directly inside `.<cls> { ... }`, nested blocks excluded. */
function ownDeclarations(src, cls) {
  const blocks = [];
  const opener = new RegExp(`\\.${cls}\\s*\\{`, 'g');
  for (const m of src.matchAll(opener)) {
    let depth = 0;
    let own = '';
    for (let i = m.index + m[0].length - 1; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) break;
      } else if (depth === 1) own += ch;
    }
    blocks.push(own);
  }
  return blocks;
}

const problems = [];
let checked = 0;

for (const cls of markerClasses) {
  for (const f of files.filter((f) => f.endsWith('.scss'))) {
    const src = readFileSync(f, 'utf8');
    for (const own of ownDeclarations(src, cls)) {
      const decl = own.match(/(^|;)\s*position\s*:\s*([a-z-]+)/);
      if (!decl) continue;
      checked++;
      if (decl[2] !== 'absolute') {
        problems.push(
          `${relative(ROOT, f)}: .${cls} sets "position: ${decl[2]}" -- ` +
            `it is a Leaflet divIcon class and must stay absolute`
        );
      }
    }
  }
}

if (markerClasses.size === 0) {
  console.error(
    `::error::marker position gate FOUND NO divIcon CLASSES under ${ROOT} -- the gate is a no-op, which is worse than a failure. Verify the path and the className matcher (OBRS-1335).`
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`Leaflet marker position gate FAILED (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `::error::A Leaflet divIcon class declares a "position" other than absolute. The marker drops back into the pane's normal flow and every marker after the first is drawn too low -- on the fleet map that put the pins out at sea (OBRS-1335).`
  );
  process.exit(1);
}

console.log(
  `Leaflet marker position gate OK: ${markerClasses.size} divIcon class(es), ${checked} position declaration(s), all absolute.`
);
