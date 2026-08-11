// OBRS-1207 — the FAB's yield trigger and the gate that proves it must name the
// same set of elements.
//
// Two lists, in two compilation roots that cannot import from each other:
//
//   src/app/shared/components/report-usability-fab/report-usability-fab.component.ts
//       FAB_YIELD_TRIGGER_SELECTOR  — what the running app steps aside for
//   e2e/support/fab-occlusion.ts
//       INTERACTIVE_SELECTOR        — what the merge gate looks for underneath it
//
// Drift here fails SILENTLY and in the worst direction. Drop `summary` from the
// component and the gate keeps testing a rule the app no longer enforces; drop
// it from the gate and a whole element type stops being checked. Either way the
// run is green and the evidence is worthless — which is precisely the failure
// this card was opened to end, since `report-usability-issue.spec.ts` spent
// months green over a live defect.
//
// A shared constant would be better than a checker. There isn't one available:
// `e2e/tsconfig.json` compiles against a different root and pulling app source
// into the spec bundle drags Angular's DI in with it. So the two stay separate
// and this makes the copy compulsory rather than hopeful.
//
// Run: node scripts/check-fab-yield-selector.mjs   (wired into `npm test` lanes
// the same way as its neighbours in this folder)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  {
    file: 'src/app/shared/components/report-usability-fab/report-usability-fab.component.ts',
    constant: 'FAB_YIELD_TRIGGER_SELECTOR',
  },
  {
    file: 'e2e/support/fab-occlusion.ts',
    constant: 'INTERACTIVE_SELECTOR',
  },
];

/**
 * Pulls the quoted entries out of `const NAME = [ ... ].join(', ')`.
 *
 * Deliberately not a regex over the whole file: two array literals in the same
 * file would make a looser pattern match whichever came first, and a checker
 * that reads the wrong array is worse than no checker.
 */
function extract({ file, constant }) {
  const text = readFileSync(join(root, file), 'utf8');
  const start = text.indexOf(`${constant} = [`);
  if (start === -1) {
    throw new Error(`${file}: could not find \`${constant} = [\` — has it been renamed?`);
  }
  const open = text.indexOf('[', start);

  // Scan for the closing bracket rather than `indexOf(']')`. The first version
  // of this file did the naive thing and reported "1 entries, both lists agree"
  // — a PASS — because `'input:not([type="hidden"])'` closes a bracket INSIDE a
  // string literal, so it stopped reading after one entry. A checker that
  // silently checks one twelfth of what it claims to is the same class of
  // defect as the test this card is replacing, so: track quote state.
  let depth = 0;
  let close = -1;
  let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '[') depth += 1;
    else if (c === ']') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) {
    throw new Error(`${file}: \`${constant}\` has no closing bracket`);
  }
  const body = text.slice(open + 1, close);
  const entries = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (entries.length === 0) {
    throw new Error(`${file}: \`${constant}\` is empty`);
  }
  return entries;
}

const [component, gate] = SOURCES.map(extract);

const onlyInComponent = component.filter((s) => !gate.includes(s));
const onlyInGate = gate.filter((s) => !component.includes(s));

if (onlyInComponent.length || onlyInGate.length) {
  console.error('FAB yield selector drift (OBRS-1207):');
  if (onlyInComponent.length) {
    console.error(
      `  in ${SOURCES[0].constant} but NOT in ${SOURCES[1].constant}: ${onlyInComponent.join(', ')}`
    );
    console.error('    → the app yields for these, but the gate never checks that it does.');
  }
  if (onlyInGate.length) {
    console.error(
      `  in ${SOURCES[1].constant} but NOT in ${SOURCES[0].constant}: ${onlyInGate.join(', ')}`
    );
    console.error('    → the gate looks for these underneath the FAB, which will never step aside.');
  }
  console.error('  Fix by editing BOTH lists, not by editing this checker.');
  process.exit(1);
}

console.log(`FAB yield selector: ${component.length} entries, both lists agree.`);
