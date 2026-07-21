// Object-literal map lookup gate -- the prototype chain (OBRS-608, enforcing ADR-0028).
//
// Why this exists: every object literal inherits from `Object.prototype`, so all three
// idioms this codebase reached for by reflex admit inherited members:
//
//   MAP[key] ?? FALLBACK           // MAP['constructor'] is the Object FUNCTION --
//   (key && MAP[key]) || FALLBACK  // non-nullish AND truthy, so neither operator fires
//   key in MAP                     // 'constructor' in MAP === true
//
// The caller is then holding a function where it expected a record or a string, and no
// branch reports an error because as far as every guard on the path is concerned the
// lookup succeeded. OBRS-427 shipped this: its FIX for a raw-i18n-key defect used
// `key in MAP` and thereby emitted `PARCEL_TRACKING.STATUS.CONSTRUCTOR` -- a key in no
// locale bundle -- i.e. it manufactured the exact symptom the card existed to prevent.
// OBRS-601 then swept src/ and found the same shape in 23 places across 5 clusters,
// including `ROLE_GRANTS[role]` (role comes from user-editable localStorage; the
// unguarded lookup threw inside every route guard) and `detailStatusValuesFor()` (no
// fallback at all; blanked the whole detail modal).
//
// OBRS-601 fixed those 23. Nothing stopped the 24th. This gate is the 24th's stop.
//
// The FIX shape is `shared/lib/own-key.ts`'s `hasOwnKey()` type predicate, in either of
// the two forms already in the tree:
//   hasOwnKey(MAP, key) ? MAP[key] : FALLBACK
//   if (key && hasOwnKey(MAP, key)) { return MAP[key]; }
// For the 18-strong error-code cluster the chokepoint is `mapApiErrorCode()` in
// shared/lib/api-error-code.ts, which already applies the predicate internally.
//
// What it flags, on any binding this scan can see is an object-literal map:
//   1. a dynamic index read  `MAP[expr]` / `this.MAP[expr]` / `Cls.MAP[expr]`, where
//      `expr` is anything other than a bare string or numeric literal
//   2. the membership test   `expr in MAP`  (a `for (const k in MAP)` loop is NOT
//      flagged -- `Object.prototype`'s members are non-enumerable, so for-in is safe)
// unless a `hasOwnKey(MAP, ...)` call appears within GUARD_LOOKBACK characters before it.
//
// Note what this catches that a grep for the three idioms above CANNOT: the shape
// `if (MAP[k]) { use MAP[k] }` with no fallback operator anywhere. Scrutinize flagged
// that as a fourth shape findable only by reading (OBRS-601 retrospective). This gate
// keys off the MAP DECLARATION, not off `??`/`||`/`in`, so the fourth shape is ordinary
// coverage here rather than a hole.
//
// A deliberate exception -- ADR-0028 names three, all keyed by a server-enumerated stop
// code or seat label -- is allowed via an opt-out comment:
//   // proto-key-ok: <reason>
// placed anywhere within OPT_OUT_LOOKBACK characters before the flagged lookup. The
// reason string is REQUIRED: a bare `proto-key-ok:` with nothing after the colon does
// not suppress the finding, so an opt-out always self-documents why.
//
// Known blind spots -- this is a regex/bracket-balance scan, NOT a TypeScript parser.
// Stated plainly rather than hedged, because a reader who trusts this gate deserves to
// know its edges:
//   1. Same map, different key. The guard match is by MAP NAME, not by key expression,
//      so `hasOwnKey(M, a) ? M[a] : M[b]` passes on both reads. Deliberate: the real
//      instance of that shape in the tree (auth.interceptor.ts) has a module-constant
//      `DEFAULT_LANGUAGE` as the second key, and key-exact matching would have made the
//      gate's first act a false positive on correct code.
//   2. A map reached through an alias or a return value: `const m = MAPS[x]; m[key]`.
//      The alias is not tracked back to the literal.
//   3. A map imported through a barrel/index re-export. Direct relative imports ARE
//      resolved (see resolveImportedMaps); a re-export hop is not followed.
//   4. A map built by `Object.fromEntries(...)` / spread rather than written as a
//      literal -- there is no `= {` to see. (`Object.create(null)` genuinely has no
//      prototype and is safe, which is why literal-ness is the trigger.)
//   5. A guard behind a NAMED LOCAL TYPE PREDICATE rather than a direct `hasOwnKey`
//      call: `isKnownStatusSlug(slug) ? MAP[slug] : FALLBACK`, where the predicate body
//      is the hasOwnProperty call. Correct code the scan reads as unguarded; it takes
//      an opt-out. Real instance: shared/lib/parcel-delivery-status.ts.
//   6. A NAMED type alias used as a Record key is deliberately NOT auto-excused, even
//      when it resolves to a literal union declared in the same file. Only an INLINE
//      union counts (see isConfinedKeyType). This costs three opt-outs today
//      (`Locale`, `InspectionItemLocale`, `FleetVehicleStatus`) and is the point: the
//      lookup OBRS-601 was filed against, `Record<Exclude<ParcelBookingStatus,
//      'confirmed'>, T>`, LOOKS exactly as narrow and was not. Requiring a human to
//      write down why each alias is safe is cheaper than the sweep that finds the one
//      that isn't.
// Anything found but unreadable is counted in `sitesSkipped` and printed on success, so
// lost coverage is a visible NUMBER and never a silent OK.
//
// Reads .ts files with fs -- no Angular/TypeScript bundling -- so it is fast and runs
// before `npm ci`. Run locally with: npm run test:proto-key
//
// ASCII-only source.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

// Defaults to src/app; an optional argv[2] override exists only so the gate's own
// before/after proof can be run against a different tree (the OBRS-608 red-baseline
// check against 7f1505c), mirroring check-store-null-handling.mjs / check-i18n-parity.mjs.
const SRC_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');

/** How far back from a lookup a `hasOwnKey(MAP, ...)` call still counts as guarding it.
 * Both shapes in the tree put the guard within ~120 chars (a ternary test, or an `if`
 * condition one line up). 500 leaves room for a wrapped condition without letting an
 * unrelated guard elsewhere in the function silence a lookup. */
const GUARD_LOOKBACK = 500;
/** Opt-out comments sit directly above the site they excuse; a wider window than the
 * guard's would let one marker silence a whole file. */
const OPT_OUT_LOOKBACK = 800;

// `[ \t]` NOT `\s` on both sides of the colon: `\s` crosses newlines, so a bare
// `// proto-key-ok:` would match the first character of the NEXT LINE OF CODE and
// silence the gate while documenting nothing -- exactly the escape hatch this marker
// must not have. The reason has to sit on the marker's own line. (Lesson inherited
// from check-store-null-handling.mjs, OBRS-506.)
const OPT_OUT = /proto-key-ok[ \t]*:[ \t]*\S/;

/** Files the rule applies to. Specs are excluded: own-key.spec.ts deliberately CALLS
 * the broken idioms to pin them as broken, and a gate that fails on its own probe
 * tests would teach people to delete the probes. */
function isCheckedFile(path) {
  return (
    path.endsWith('.ts') &&
    !path.endsWith('.spec.ts') &&
    !path.endsWith('.d.ts') &&
    // The helper's own definition, where `map` is a generic T and not a literal.
    !path.replace(/\\/g, '/').endsWith('/shared/lib/own-key.ts')
  );
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (isCheckedFile(full)) out.push(full);
  }
  return out;
}

/**
 * Return the source between an opening bracket (index points AT the opening char) and
 * its matching close, tracking nesting. Returns null if they never balance (a
 * truncated/odd file) rather than guessing at a boundary.
 */
function readBalanced(source, openIndex, open, close) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return { text: source.slice(openIndex + 1, i), end: i };
    }
  }
  return null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Produce a same-length copy of `source` with every character inside a `//`/`/* *\/`
 * comment or a string/template literal replaced by a space (newlines kept, so line
 * numbers computed from either string still agree). All STRUCTURAL scanning runs
 * against this masked text -- otherwise a comment merely MENTIONING `MAP[key]` (this
 * codebase has many, documenting the OBRS-601 fix) is indistinguishable from real code.
 * The `proto-key-ok:` marker deliberately reads the ORIGINAL source, since it lives
 * inside a real comment on purpose.
 *
 * Template literals are masked WHOLE, including any `${...}`. That is why the
 * literal-key test below reads the original text: a masked `` MAP[`${x}`] `` would
 * otherwise look like a blank (i.e. literal) key and slip through.
 */
function maskCommentsAndStrings(source) {
  const out = Array.from(source);
  let i = 0;
  while (i < out.length) {
    const two = source[i] + (source[i + 1] ?? '');
    if (two === '//') {
      let j = i;
      while (j < out.length && source[j] !== '\n') {
        out[j] = ' ';
        j += 1;
      }
      i = j;
      continue;
    }
    if (two === '/*') {
      let j = i;
      while (j < out.length && source.slice(j, j + 2) !== '*/') {
        if (out[j] !== '\n') out[j] = ' ';
        j += 1;
      }
      if (j < out.length) {
        out[j] = ' ';
        out[j + 1] = ' ';
        j += 2;
      }
      i = j;
      continue;
    }
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out[i] = ' ';
      i += 1;
      while (i < out.length && source[i] !== quote) {
        if (source[i] === '\\') {
          out[i] = ' ';
          i += 1;
          if (i < out.length && out[i] !== '\n') out[i] = ' ';
          i += 1;
          continue;
        }
        if (out[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < out.length) out[i] = ' ';
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// Pass 1 -- which bindings are object-literal maps?
// ---------------------------------------------------------------------------

// `const M = {` / `const M: Record<string, X> = {` / `private static readonly M: T = {`.
// The type annotation may not contain `;`, `{` or `}` -- a generic like
// `Record<string, string[]>` does not, an inline object type does, and an inline object
// type is not the shape we are after.
const LITERAL_DECL =
  /(?:^|[;{}()\s])(?:const|let|var|readonly|static|private|public|protected)\s+([A-Za-z_$][\w$]*)\s*(:[^=;{}]*)?=\s*\{/g;

// A binding TYPED as a record without an initializer here -- most importantly the
// `knownCodes: Record<string, string>` parameter that the 18-site error-code cluster
// passes object literals into, and the `@Input() seatGenders: Record<string, string>`
// fields ADR-0028 names as deliberate exceptions. The callee/component cannot see the
// literal, but every caller hands it one, so the hole is real here.
const RECORD_TYPED = /\b([A-Za-z_$][\w$]*)\s*(:\s*(?:Readonly\s*<\s*)?Record\s*<[^;={}]*)/g;

/**
 * Extract a `Record<K, V>` annotation's KEY type argument, respecting nested generics.
 *
 * Splitting on the first comma is WRONG and was this gate's own first bug: the real
 * declaration `Record<Exclude<ParcelBookingStatus, 'confirmed'>, ParcelPaymentFlag>`
 * has its first comma INSIDE `Exclude<...>`, so a naive split yields
 * "Record<Exclude<ParcelBookingStatus" and the binding silently drops out of the scan.
 * That binding is `PARCEL_PAYMENT_FLAG_MAP` -- the exact site OBRS-601 was filed
 * against. A gate that cannot see the bug that motivated it is a no-op with good
 * intentions, and only the red-baseline run (AC 5) surfaced it.
 */
function recordKeyType(annotation) {
  const at = /Record\s*</.exec(annotation);
  if (!at) return null;
  let depth = 0;
  const start = at.index + at[0].length;
  for (let i = start; i < annotation.length; i += 1) {
    const ch = annotation[i];
    if (ch === '<') depth += 1;
    else if (ch === '>') {
      if (depth === 0) return annotation.slice(start, i).trim();
      depth -= 1;
    } else if (ch === ',' && depth === 0) return annotation.slice(start, i).trim();
  }
  return null;
}

/**
 * True if a `Record<K, V>` key type genuinely confines the key to a set spelled out
 * RIGHT HERE, so no runtime string can reach the index.
 *
 * ADR-0028's exact words for the six lookups it audited and left alone: the key is "a
 * locally computed literal union ... with no `as` cast anywhere in the chain". Both
 * halves matter, and only an INLINE union satisfies them:
 *
 *   Record<'th' | 'en' | 'zh', T>   -- confined. `MONTHS_SHORT`, the locale month
 *                                      tables: the legal keys are visible at the
 *                                      declaration and TypeScript refuses anything else.
 *   Record<number, T>               -- confined. A numeric key never spells 'constructor'.
 *   Record<UsabilityReportStatus, T> -- NOT confined, though it looks it. The alias
 *                                      resolves to a union, but the VALUE was asserted
 *                                      into that union at the API boundary far upstream;
 *                                      `report.status` is raw server text. This is
 *                                      `detailStatusValuesFor()`, which had no fallback
 *                                      at all and blanked the detail modal (OBRS-601).
 *   Record<Exclude<Status, 'x'>, T> -- NOT confined, same reason, and its call site
 *                                      needed `key as Exclude<...>` to compile. ADR-0028:
 *                                      "the cast was the tell -- it asserted at compile
 *                                      time precisely the thing that was false at runtime."
 *
 * So: an inline union of string literals, or a numeric key. A NAMED type is not
 * evidence; it is a promise made somewhere this scan cannot see.
 */
function isConfinedKeyType(annotation) {
  const key = recordKeyType(annotation);
  if (key === null) return false;
  if (/^number$/.test(key)) return true;
  return /^'[^']*'(\s*\|\s*'[^']*')*$/.test(key);
}

/**
 * Names in `masked` that behave as a fixed object-literal lookup table, and the subset
 * that is exported. Two admissible shapes:
 *
 *   a. an initializer that is a NON-EMPTY object literal -- a closed set of keys written
 *      out in source. An empty `= {}` is an accumulator the code fills at runtime; its
 *      key set is whatever was put in it, so "is this key one of the declared ones" is
 *      not a question that exists.
 *   b. an explicit `Record<string, T>` annotation, initializer or not.
 *
 * Anything annotated `Record<'a' | 'b', T>` or `Record<number, T>` is excluded by
 * isStringKeyedAnnotation() even when it also has a literal initializer.
 */
function collectMapNames(masked, source) {
  const names = new Set();
  const exported = new Set();

  // Type annotations are read from the ORIGINAL source at the masked offsets (masking
  // is length-preserving). Otherwise `Record<'th' | 'en' | 'zh', T>` arrives as
  // `Record<     |      |      , T>` -- every literal blanked -- and the one shape this
  // function exists to EXCLUDE becomes unrecognisable, so the six lookups ADR-0028
  // deliberately excused all come back as findings.
  const annotationAt = (m) => (m[2] ? source.substr(m.index + m[0].indexOf(m[2]), m[2].length) : '');

  const note = (name, index, matchText) => {
    names.add(name);
    const before = masked.slice(Math.max(0, index - 12), index + matchText.indexOf(name));
    if (/\bexport\b/.test(before)) exported.add(name);
  };

  LITERAL_DECL.lastIndex = 0;
  let m;
  while ((m = LITERAL_DECL.exec(masked))) {
    const annotation = annotationAt(m);
    // An explicit annotation is authoritative: `Record<'th'|'en', X> = { ... }` is a
    // confined table however non-empty its literal is.
    if (/Record\s*</.test(annotation) && isConfinedKeyType(annotation)) continue;
    const open = m.index + m[0].length - 1;
    const body = readBalanced(masked, open, '{', '}');
    if (!body) continue;
    LITERAL_DECL.lastIndex = open + 1;
    if (!/\S/.test(body.text)) continue; // `= {}` -- a runtime accumulator, not a table
    note(m[1], m.index, m[0]);
  }

  RECORD_TYPED.lastIndex = 0;
  while ((m = RECORD_TYPED.exec(masked))) {
    if (isConfinedKeyType(annotationAt(m))) continue;
    note(m[1], m.index, m[0]);
  }
  return { names, exported };
}

/** Resolve `import { A, B } from './rel'` to map names declared in that file. */
function resolveImportedMaps(masked, file, exportedByFile) {
  const found = new Set();
  const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  // Import specifiers live inside string literals for the path, which the mask erased,
  // so this one regex reads the ORIGINAL source. Callers pass it accordingly.
  let m;
  while ((m = IMPORT_RE.exec(masked))) {
    const spec = m[2];
    if (!spec.startsWith('.')) continue;
    const base = resolve(dirname(file), spec);
    const candidates = [`${base}.ts`, join(base, 'index.ts')];
    const target = candidates.find((c) => existsSync(c));
    if (!target) continue;
    const targetMaps = exportedByFile.get(target);
    if (!targetMaps) continue;
    for (const raw of m[1].split(',')) {
      // `A as B` -- the local name is what appears in the body.
      const parts = raw.trim().split(/\s+as\s+/);
      const original = parts[0].trim();
      const local = (parts[1] ?? parts[0]).trim();
      if (original && targetMaps.has(original)) found.add(local);
    }
  }
  return found;
}

const files = walk(SRC_DIR);
const maskedByFile = new Map();
const exportedByFile = new Map();

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const masked = maskCommentsAndStrings(source);
  maskedByFile.set(file, { source, masked });
  exportedByFile.set(file, collectMapNames(masked, source).exported);
}

// ---------------------------------------------------------------------------
// Pass 2 -- flag unguarded lookups
// ---------------------------------------------------------------------------

/** A key expression that is a plain string or numeric literal cannot reach the
 * prototype chain by accident -- `MAP['constructor']` is somebody's explicit choice,
 * not a runtime string arriving from a server or from localStorage. Read from the
 * ORIGINAL text, because the mask has already blanked string literals. */
function isLiteralKey(originalKeyText) {
  return /^\s*(?:'[^']*'|"[^"]*"|-?\d+)\s*$/.test(originalKeyText);
}

const problems = [];
let sitesChecked = 0;
let mapsFound = 0;
// Sites we found but could not analyse (an unbalanced `[`). Reported on success so a
// shape this scan cannot read shows up as a NUMBER instead of silently shrinking
// coverage -- a gate that skips half the tree still prints OK, and that is the failure
// mode worth surfacing.
let sitesSkipped = 0;

for (const file of files) {
  const { source, masked } = maskedByFile.get(file);
  const rel = relative(join(SRC_DIR, '..', '..'), file).replace(/\\/g, '/');

  const local = collectMapNames(masked, source).names;
  for (const imported of resolveImportedMaps(source, file, exportedByFile)) local.add(imported);
  if (local.size === 0) continue;
  mapsFound += local.size;

  const lineAt = (idx) => source.slice(0, idx).split('\n').length;
  const isGuarded = (idx, name) => {
    const back = masked.slice(Math.max(0, idx - GUARD_LOOKBACK), idx);
    return new RegExp(`hasOwnKey\\s*\\(\\s*[\\w.$]*\\b${escapeRegExp(name)}\\b`).test(back);
  };
  const isOptedOut = (idx) =>
    OPT_OUT.test(source.slice(Math.max(0, idx - OPT_OUT_LOOKBACK), idx));

  for (const name of local) {
    // ---- idiom 1 + 2: a dynamic index read, `MAP[expr]` / `this.MAP[expr]`.
    // `?.[` is included deliberately: optional chaining guards a NULLISH MAP, not an
    // inherited key, so `maybeMap?.[key]` leaks exactly as `map[key]` does.
    const INDEX_RE = new RegExp(
      `(?:\\bthis\\.|\\b[A-Za-z_$][\\w$]*\\.)?\\b${escapeRegExp(name)}\\s*(?:\\?\\.)?\\s*\\[`,
      'g'
    );
    let m;
    while ((m = INDEX_RE.exec(masked))) {
      const openBracket = m.index + m[0].length - 1;
      const span = readBalanced(masked, openBracket, '[', ']');
      if (!span) {
        sitesSkipped += 1;
        continue;
      }
      INDEX_RE.lastIndex = span.end + 1;
      const originalKey = source.slice(openBracket + 1, span.end);
      if (isLiteralKey(originalKey)) continue;
      // A WRITE (`MAP[key] = v`, `MAP[key] += 1`) is not this hazard: it stores an own
      // property and reads nothing off the prototype. Only the read side can hand the
      // caller `Object` where it expected a record. (`__proto__` assignment is a real
      // but different bug class, and belongs to a different gate.)
      if (/^\s*(?:[+\-*/|&^]|\?\?)?=(?!=)/.test(masked.slice(span.end + 1))) continue;
      // `delete MAP[key]` likewise reads nothing -- and cannot remove an inherited
      // member even if the key names one.
      if (/\bdelete\s+$/.test(masked.slice(Math.max(0, m.index - 12), m.index))) continue;

      sitesChecked += 1;
      if (isGuarded(m.index, name) || isOptedOut(m.index)) continue;
      problems.push(
        `${rel}:${lineAt(m.index)}  ${name}[${originalKey.trim()}] -- object-literal map ` +
          `indexed by a runtime value with no hasOwnKey() guard`
      );
    }

    // ---- idiom 3: `expr in MAP`. `for (const k in MAP)` is excluded -- for-in skips
    // non-enumerable properties, and every Object.prototype member is non-enumerable.
    const IN_RE = new RegExp(
      `([A-Za-z_$][\\w$.]*)\\s+in\\s+((?:this\\.|[A-Za-z_$][\\w$]*\\.)?${escapeRegExp(name)})\\b`,
      'g'
    );
    while ((m = IN_RE.exec(masked))) {
      const stmtStart = Math.max(0, m.index - 40);
      if (/\bfor\s*\([^)]*$/.test(masked.slice(stmtStart, m.index))) continue;
      sitesChecked += 1;
      if (isGuarded(m.index, name) || isOptedOut(m.index)) continue;
      problems.push(
        `${rel}:${lineAt(m.index)}  \`${m[1]} in ${m[2]}\` -- \`in\` sees the prototype ` +
          `chain ('constructor' in MAP === true); use hasOwnKey()`
      );
    }
  }
}

if (mapsFound === 0 || sitesChecked === 0) {
  console.error(
    `::error::prototype-key gate FOUND NOTHING TO CHECK under ${SRC_DIR} ` +
      `(${mapsFound} map binding(s), ${sitesChecked} dynamic lookup(s)) -- the gate is a ` +
      `no-op, which is worse than a failure. Verify the path and the declaration ` +
      `patterns in collectMapNames() (OBRS-608).`
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(
    `prototype-key gate FAILED (${problems.length} of ${sitesChecked} dynamic map lookup(s)):`
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '::error::An object-literal map is indexed by a runtime string without a hasOwnKey() ' +
      "guard. Object literals inherit from Object.prototype, so a key of 'constructor' or " +
      "'__proto__' resolves to a FUNCTION that is both non-nullish and truthy -- `?? " +
      'fallback`, `|| fallback` and `key in MAP` all fail to catch it, and the caller ' +
      'crashes or renders garbage (OBRS-427, OBRS-601). Wrap the lookup in ' +
      '`hasOwnKey(MAP, key) ? MAP[key] : FALLBACK` from shared/lib/own-key.ts (for an ' +
      'API error code use mapApiErrorCode() instead), or add a ' +
      '`// proto-key-ok: <reason>` comment for a deliberate exception (ADR-0028).'
  );
  process.exit(1);
}

console.log(
  `prototype-key gate OK: all ${sitesChecked} dynamic lookup(s) across ${mapsFound} ` +
    `object-literal map binding(s) are guarded by hasOwnKey()` +
    (sitesSkipped > 0
      ? ` (${sitesSkipped} site(s) SKIPPED as unreadable by this scan -- see "Known blind spots" in this file's header).`
      : '.')
);
