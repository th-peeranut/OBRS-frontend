// Gitignored-environment-file shape gate (OBRS-536).
//
// WHAT BREAKS WITHOUT IT
// `src/environments/environment.sit.ts` reads `localEnv.mapsApiKey`, `localEnv.googleClientId`
// and `localEnv.maptilerKey` from `environment.local.ts`, and `environment.prod.ts` reads six
// fields from `environment.prod.local.ts`. Both of those files are GITIGNORED -- OBRS-frontend
// is a public repo and they hold real keys. So the committed side of that contract moves with
// every commit while the other side does not move at all.
//
// OBRS-424 added `maptilerKey: localEnv.maptilerKey` to environment.sit.ts and updated both
// things a commit CAN update: environment.local.example.ts and scripts/inject-sit-env.js. That
// was correct and complete, and it still broke every checkout that already had an
// environment.local.ts, because a file git does not track is a file git cannot update. The
// failure is:
//
//   X [ERROR] TS2339: Property 'maptilerKey' does not exist on type
//   '{ mapsApiKey: string; googleClientId: string; }'. [plugin angular-compiler]
//       src/environments/environment.sit.ts:15:24
//
// and it does not arrive looking like that. Under Playwright the compiler's output is prefixed
// `[WebServer]` and the run dies with `Timed out waiting 120000ms from config.webServer`, which
// reads as a slow machine rather than as a type error. Both worktrees cut from origin/dev on
// the reporting machine were in that state at once, and OBRS-617 had already had to design its
// config around it ("`ng serve --configuration sit` webServer cannot even build in a fresh
// worktree") -- a card working around a defect that nobody had a card for.
//
// WHY A TYPE COULD NOT DO THIS
// The obvious fix is a shared `LocalEnv` interface both sides import. It does not reach the
// case: a stale environment.local.ts predates the interface, so it does not import it, so its
// object literal is still inferred structurally and the error is the same TS2339 in the same
// place. Worse, a type says nothing about scripts/inject-sit-env.js, which GENERATES that file
// on Netlify from env vars -- a field added to environment.sit.ts and to the example but not to
// the generator breaks the SIT deploy instead, which is the same defect wearing a different
// hat. The contract has three followers, only two of which are typed, so it is checked here.
//
// WHAT IT ENFORCES, per gitignored file:
//
//   1. REQUIRED SET. Derived from the committed consumers -- every `localEnv.<field>` /
//      `prodEnv.<field>` reference in src/environments/environment*.ts. Anchored on what
//      actually fails the build, not on what the example file happens to list: a template is
//      only a guess about the required set, and it was the template being right that made
//      OBRS-424 look complete.
//   2. The `*.example.ts` template declares EXACTLY that set. Missing -> a fresh checkout that
//      copies the template still cannot build. Extra -> the template is asking for a value
//      nothing reads, which is how a stale field survives a deletion.
//   3. The generator (scripts/inject-*.js) emits EXACTLY that set. This is the Netlify/prod
//      build path and it has no example file to copy.
//   4. If the gitignored file EXISTS on this machine, it holds at least that set. Extra fields
//      are fine here and only here -- a developer's own file may carry values for a branch
//      they are also working on. This is the check that fires for the OBRS-536 case.
//   5. With `--require-local`, environment.local.ts must exist at all (that flag covers only
//      that file -- see CHANNELS for why prod has no equivalent). Only the lanes that
//      actually build with it pass that flag (see package.json): `ng build --configuration
//      ci-smoke` and `ng test` build against environment.ts, which imports nothing gitignored,
//      and GitHub CI runs this gate before `npm ci` with neither file on disk.
//
// Rules 2 and 3 are the ones CI can enforce, and they are what stops the NEXT field from
// drifting. Rule 4 is the one that unbreaks the machine in front of you.
//
// BLIND SPOTS, STATED PLAINLY:
//   - Field NAMES only. A field present but empty passes; that is deliberate and load-bearing
//     -- `maptilerKey: ''` is a supported state that degrades to the MAP_UNAVAILABLE
//     placeholder, and inject-sit-env.js defaults it to '' on purpose. Value-level rules for
//     prod live in scripts/inject-prod-env.js and src/environments/prod-config-guard.ts.
//   - The consumer census is a regex over comment-blanked source. `...localEnv` and
//     `const { a } = localEnv` are reported as parse failures rather than passed over, but a
//     field reached by a computed key (`localEnv[name]`) is invisible to it.
//   - A lane that runs `npx ng serve --configuration sit` WITHOUT going through an npm script
//     bypasses this gate entirely. Every playwright config in this repo whose webServer needs
//     the SIT configuration was moved onto `npm run start:sit` for that reason; a new one
//     written the old way gets the old failure.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_DIR = join(ROOT, 'src', 'environments');

// One entry per gitignored file. `binding` is the exported const name, which is also what the
// consumers dereference -- keeping them the same is what lets the census be a regex.
//
// `requireFlag` is per channel and not global on purpose. The first draft had one
// `--require-local` boolean covering both, so `npm start` -- a SIT-only lane -- demanded an
// environment.prod.local.ts that no developer has ever had and that nothing on that path reads.
// A gate that fires on a correct tree gets deleted, not obeyed.
const CHANNELS = [
  {
    binding: 'localEnv',
    generated: 'src/environments/environment.local.ts',
    template: 'src/environments/environment.local.example.ts',
    generator: 'scripts/inject-sit-env.js',
    requireFlag: '--require-local',
    neededBy: '`npm start` / `--configuration sit` (the SIT bundle and every Playwright lane that serves it)',
  },
  {
    // No requireFlag, and there is nothing to add one for: the only lane that builds against
    // this file is `npm run build:prod`, which runs `node scripts/inject-prod-env.js` to CREATE
    // it in the same command -- after any npm pre-hook has already run. Its absence is the
    // normal state of every checkout, so demanding it could only ever be a false positive.
    // Rules 2 and 3 still apply to it, and they are the ones that matter here: a field added to
    // environment.prod.ts but not to inject-prod-env.js breaks the prod build on the host.
    binding: 'prodEnv',
    generated: 'src/environments/environment.prod.local.ts',
    template: 'src/environments/environment.prod.local.example.ts',
    generator: 'scripts/inject-prod-env.js',
    requireFlag: null,
    neededBy: '`npm run build:prod`',
  },
];

const errors = [];
const fail = (msg) => errors.push(msg);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// Blank comments while preserving every byte position, so line numbers stay real. Needed
// because these files explain themselves at length and several header comments NAME the
// fields ("`prodEnv.*` -- the values that genuinely differ per deploy"). A regex census that
// counted those would demand a field forever after its last real reader was deleted. Tracks
// string and template state, or it blanks the `//` inside an `https://` URL.
function blankComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === '\\') {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const lineAt = (src, index) => src.slice(0, index).split('\n').length;

/**
 * Top-level keys of `const <binding> = { ... }`.
 *
 * Deliberately does not require `export`: in scripts/inject-*.js the declaration lives INSIDE a
 * template literal (`const content = \`export const localEnv = { ... }\``), which is the
 * generated file's text and not code this file executes. blankComments leaves template-literal
 * contents byte-for-byte intact, so one parser reads the template, the generator and the
 * developer's own copy -- three followers of one contract, checked the same way.
 *
 * Comments MUST be blanked before the brace scan, not merely per key line. The scan tracks
 * quotes so a `{` inside a string does not open a level, and an ordinary English apostrophe in
 * a comment ("inject-prod-env.js's required list", which is really in
 * environment.prod.local.example.ts) then reads as an unterminated string and swallows the rest
 * of the file. The first draft of this parser did exactly that and reported that file's literal
 * as never closed.
 *
 * Returns { keys } or { error }. Never a silent empty set: a shape it cannot read is reported,
 * because "found no keys" and "there are no keys" are the same value and opposite facts.
 */
function objectLiteralKeys(rawSrc, binding) {
  const src = blankComments(rawSrc);
  const decl = new RegExp(`const\\s+${binding}\\s*(?::[^=]*)?=\\s*\\{`).exec(src);
  if (!decl) {
    return { error: `could not find a \`const ${binding} = { ... }\` declaration` };
  }

  const open = decl.index + decl[0].length - 1;
  let depth = 0;
  let end = -1;
  let quote = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    return { error: `the \`${binding}\` object literal is never closed` };
  }

  const body = src.slice(open + 1, end);
  const keys = [];
  let depthNow = 0;
  let q = null;
  for (const line of body.split('\n')) {
    if (depthNow === 0) {
      if (/^\s*\.\.\./.test(line)) {
        return {
          error:
            `the \`${binding}\` object literal spreads another value (\`${line.trim()}\`), so its ` +
            `key set is not readable from the source. Spell the fields out.`,
        };
      }
      const m = /^\s*(\w+)\s*:/.exec(line);
      if (m) keys.push(m[1]);
    }
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '\\') i++;
        else if (c === q) q = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '{' || c === '[') depthNow++;
      else if (c === '}' || c === ']') depthNow--;
    }
  }
  return { keys };
}

/**
 * Every field the COMMITTED environment files read off `binding`, with the first site that
 * reads it. This is the required set -- it is what the compiler will demand.
 */
function censusConsumers(binding, skipFiles) {
  const found = new Map();
  const problems = [];
  const files = readdirSync(ENV_DIR)
    .filter((f) => /^environment.*\.ts$/.test(f) && !f.endsWith('.spec.ts'))
    .map((f) => join('src', 'environments', f))
    .filter((f) => !skipFiles.includes(f.split('\\').join('/')));

  for (const rel of files) {
    const src = blankComments(readFileSync(join(ROOT, rel), 'utf8'));
    const posix = rel.split('\\').join('/');

    const spread = new RegExp(`\\.\\.\\.\\s*${binding}\\b`).exec(src);
    if (spread) {
      problems.push(
        `${posix}:${lineAt(src, spread.index)} spreads \`${binding}\` wholesale. This gate ` +
          `derives the required field set from the fields that are named, so a spread makes ` +
          `the requirement unreadable -- and it also silently accepts whatever a stale file ` +
          `happens to hold, which is the defect. Name the fields.`,
      );
    }
    const destructure = new RegExp(`(?:const|let|var)\\s*\\{[^}]*\\}\\s*=\\s*${binding}\\b`).exec(src);
    if (destructure) {
      problems.push(
        `${posix}:${lineAt(src, destructure.index)} destructures \`${binding}\`. Use ` +
          `\`${binding}.field\` so this gate can see which fields are required.`,
      );
    }

    for (const m of src.matchAll(new RegExp(`\\b${binding}\\.(\\w+)`, 'g'))) {
      if (!found.has(m[1])) found.set(m[1], `${posix}:${lineAt(src, m.index)}`);
    }
  }
  return { required: found, problems };
}

// ---------------------------------------------------------------------------
// Self-test -- the gate's own must-catch / must-NOT-catch proof, run before it
// will report on the tree. A shape parser that quietly returns [] reports every
// file as satisfying every requirement, which is a green run meaning nothing.
// ---------------------------------------------------------------------------

const SELF_TEST_CASES = [
  // ---- objectLiteralKeys: the three real shapes it has to read.
  ['keys', "export const localEnv = {\n  mapsApiKey: '',\n  googleClientId: '',\n};", 'localEnv', 'mapsApiKey,googleClientId'],
  // ...the same declaration nested inside a generator's template literal, unexported.
  ['keys', "const content = `export const localEnv = {\n  mapsApiKey: '${v}',\n  maptilerKey: '${k}',\n};\n`;", 'localEnv', 'mapsApiKey,maptilerKey'],
  ['keys', 'const prodEnv = {\n  apiUrl: JSON.stringify(a),\n  promptpayId: JSON.stringify(b),\n};', 'prodEnv', 'apiUrl,promptpayId'],
  // A commented-out field is not a field. This is the case a plain /^\s*(\w+):/ sweep gets
  // wrong, and it would report the OBRS-536 tree as already fixed.
  ['keys', "export const localEnv = {\n  mapsApiKey: '',\n  // maptilerKey: '',\n};", 'localEnv', 'mapsApiKey'],
  // Keys inside a NESTED object belong to the nested object, not to the contract.
  ['keys', "export const localEnv = {\n  mapsApiKey: '',\n  promptpay: { id: '1', baseUrl: '' },\n  googleClientId: '',\n};", 'localEnv', 'mapsApiKey,promptpay,googleClientId'],
  // A brace inside a STRING must not open a level; `{` in a value is ordinary text.
  ['keys', "export const localEnv = {\n  mapsApiKey: 'a{b',\n  googleClientId: '',\n};", 'localEnv', 'mapsApiKey,googleClientId'],
  // An English apostrophe inside a comment must not read as an unterminated string. The first
  // draft scanned raw source and this shape -- which is really in
  // environment.prod.local.example.ts -- made it report the literal as never closed.
  ['keys', "export const prodEnv = {\n  apiUrl: '',\n  // NOT on inject-prod-env.js's required list.\n  maptilerKey: '',\n};", 'prodEnv', 'apiUrl,maptilerKey'],
  // ...and a brace inside a comment must not open a level either.
  ['keys', "export const localEnv = {\n  mapsApiKey: '',\n  // shaped like { id: x }\n  googleClientId: '',\n};", 'localEnv', 'mapsApiKey,googleClientId'],
  // ---- objectLiteralKeys: shapes it must REFUSE rather than read as empty.
  ['keys-error', 'export const somethingElse = { a: 1 };', 'localEnv'],
  ['keys-error', "export const localEnv = {\n  ...defaults,\n  mapsApiKey: '',\n};", 'localEnv'],
  ['keys-error', "export const localEnv = {\n  mapsApiKey: '',", 'localEnv'],
  // ---- the diff itself: this is the OBRS-424 -> OBRS-536 sequence, in both directions.
  ['diff', ['mapsApiKey', 'googleClientId', 'maptilerKey'], ['mapsApiKey', 'googleClientId'], 'maptilerKey', ''],
  ['diff', ['mapsApiKey'], ['mapsApiKey', 'googleClientId'], '', 'googleClientId'],
  ['diff', ['mapsApiKey', 'googleClientId'], ['googleClientId', 'mapsApiKey'], '', ''],
];

function diffSets(required, present) {
  const have = new Set(present);
  const need = new Set(required);
  return {
    missing: required.filter((f) => !have.has(f)),
    extra: present.filter((f) => !need.has(f)),
  };
}

function runSelfTest() {
  const failures = [];
  for (const [kind, ...rest] of SELF_TEST_CASES) {
    if (kind === 'keys') {
      const [src, binding, expected] = rest;
      const r = objectLiteralKeys(src, binding);
      const got = r.keys ? r.keys.join(',') : `ERROR(${r.error})`;
      if (got !== expected) failures.push(`  - objectLiteralKeys expected "${expected}", got "${got}"`);
    } else if (kind === 'keys-error') {
      const [src, binding] = rest;
      const r = objectLiteralKeys(src, binding);
      if (!r.error) failures.push(`  - objectLiteralKeys should have REFUSED to parse, returned "${r.keys}"`);
    } else {
      const [required, present, expMissing, expExtra] = rest;
      const d = diffSets(required, present);
      if (d.missing.join(',') !== expMissing || d.extra.join(',') !== expExtra) {
        failures.push(
          `  - diffSets expected missing="${expMissing}" extra="${expExtra}", ` +
            `got missing="${d.missing.join(',')}" extra="${d.extra.join(',')}"`,
        );
      }
    }
  }
  return failures;
}

const selfTestFailures = runSelfTest();
if (selfTestFailures.length > 0) {
  console.error('local-env shape gate FAILED ITS OWN SELF-TEST:');
  for (const f of selfTestFailures) console.error(f);
  console.error(
    '::error::This gate can no longer read an object literal, so a file missing every field ' +
      'would pass it. Fix objectLiteralKeys before trusting any run (OBRS-536).',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

const summary = [];

for (const ch of CHANNELS) {
  const { required, problems } = censusConsumers(ch.binding, [ch.generated, ch.template]);
  for (const p of problems) fail(p);

  if (required.size === 0) {
    // Nothing reads it. Not an error -- but say so, because a silent zero here would make
    // every other check below vacuously pass.
    summary.push(`${ch.binding}: no committed file reads it (nothing to check)`);
    continue;
  }
  const requiredFields = [...required.keys()];

  // --- 2. the template a fresh checkout copies -----------------------------
  const tmplRes = objectLiteralKeys(readFileSync(join(ROOT, ch.template), 'utf8'), ch.binding);
  if (tmplRes.error) {
    fail(`${ch.template}: ${tmplRes.error}`);
  } else {
    const { missing, extra } = diffSets(requiredFields, tmplRes.keys);
    for (const f of missing) {
      fail(
        `${ch.template} has no \`${f}\`, but ${required.get(f)} reads \`${ch.binding}.${f}\`. ` +
          `Anyone who creates their file from this template gets a build that cannot compile.`,
      );
    }
    for (const f of extra) {
      fail(
        `${ch.template} declares \`${f}\`, which no committed environment file reads. Either a ` +
          `consumer was deleted and this field outlived it, or the field is misspelt here.`,
      );
    }
  }

  // --- 3. the generator, which is the deploy path and copies no template ----
  const genRes = objectLiteralKeys(readFileSync(join(ROOT, ch.generator), 'utf8'), ch.binding);
  if (genRes.error) {
    fail(
      `${ch.generator}: ${genRes.error}. It is supposed to WRITE \`export const ${ch.binding} = ` +
        `{ ... }\`; this gate reads that literal out of its template string.`,
    );
  } else {
    const { missing, extra } = diffSets(requiredFields, genRes.keys);
    for (const f of missing) {
      fail(
        `${ch.generator} does not emit \`${f}\`, but ${required.get(f)} reads ` +
          `\`${ch.binding}.${f}\`. The generated file is what the DEPLOY builds against, so this ` +
          `breaks the hosted build even though every checkout on this machine is fine.`,
      );
    }
    for (const f of extra) {
      fail(`${ch.generator} emits \`${f}\`, which no committed environment file reads.`);
    }
  }

  // --- 4/5. the gitignored file on THIS machine ----------------------------
  const generatedPath = join(ROOT, ch.generated);
  if (!existsSync(generatedPath)) {
    if (ch.requireFlag && process.argv.includes(ch.requireFlag)) {
      fail(
        `${ch.generated} does not exist, and this lane builds with it — ${ch.neededBy}.\n` +
          `      It is gitignored (OBRS-frontend is a public repo), so a fresh clone or a new\n` +
          `      git worktree never has one. Create it:\n\n` +
          `        cp ${ch.template} ${ch.generated}\n\n` +
          `      then fill in real values. Blank values build fine; see the template's header.`,
      );
    } else {
      summary.push(`${ch.binding}: ${ch.generated} absent (not required by this lane)`);
      continue;
    }
  } else {
    const gotRes = objectLiteralKeys(readFileSync(generatedPath, 'utf8'), ch.binding);
    if (gotRes.error) {
      fail(`${ch.generated}: ${gotRes.error}`);
    } else {
      // Only `missing` is a finding. An EXTRA field in a developer's own copy is harmless --
      // TypeScript reads the literal structurally and nothing dereferences what it does not
      // name -- and forbidding it would red the box of anyone who also has a branch in flight
      // that adds a field. The template and the generator are held to equality; this file is
      // not, on purpose.
      const { missing } = diffSets(requiredFields, gotRes.keys);
      if (missing.length > 0) {
        const lines = missing.map((f) => `        ${f}: '',   // read by ${required.get(f)}`);
        fail(
          `${ch.generated} is missing ${missing.length} field(s) that the committed environment\n` +
            `      files read from it: ${missing.join(', ')}\n\n` +
            `      Add to \`${ch.binding}\` in ${ch.generated}:\n\n` +
            lines.join('\n') +
            `\n\n      That file is gitignored, so no commit could have carried the change to you —\n` +
            `      this is exactly OBRS-536. Left alone it surfaces as\n` +
            `      \`TS2339: Property '${missing[0]}' does not exist on type ...\` from the\n` +
            `      environment file above and, under Playwright, as\n` +
            `      \`Timed out waiting 120000ms from config.webServer\` with the real error buried\n` +
            `      in a [WebServer] line.`,
        );
      } else {
        summary.push(`${ch.binding}: ${requiredFields.length} field(s), all present`);
      }
    }
  }
}

// ---------------------------------------------------------------------------

if (errors.length) {
  console.error(`\nlocal-env shape gate FAILED — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  - ${e}\n`);
  console.error(
    `See docs/local-environment-files.md for what each of these files is and which lane needs it.\n`,
  );
  process.exit(1);
}

console.log(
  `local-env shape gate OK — ${SELF_TEST_CASES.length} self-test case(s) passed, then: ` +
    summary.join('; '),
);
