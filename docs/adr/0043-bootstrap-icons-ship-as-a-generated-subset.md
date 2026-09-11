# Bootstrap Icons ship as a generated subset, not as the package's own stylesheet (OBRS-392)

## Context

`angular.json` listed `node_modules/bootstrap-icons/font/bootstrap-icons.css` as a global
style, which is the way the package documents itself. A global style is on the critical
path of the first paint, so every first visit downloaded the whole icon font before the
page could finish rendering.

Measured on this branch, `npm run build:sit`, `gzip -9` over `dist/obrs/browser`:

| | first visit |
| --- | --- |
| `media/bootstrap-icons-*.woff2` | **130,396 B** (2,050 glyphs) |
| icons the app references | **39** (`grep -rhoE '\bbi-[a-z0-9-]+' src`, cross-checked against `bootstrap-icons.json`) |

The font was 17% of a 755,763 B first visit to deliver 1.9% of what it carries, and the
2,050 `content` rules were a further ~13 kB gz inside `styles.css`.

## Decision

`src/styles/bootstrap-icons-subset.scss` + `src/styles/fonts/bootstrap-icons-subset.woff2`
replace the package stylesheet in all three `angular.json` style lists (build, `gate`, test).
Both files are **generated** by `scripts/build-bootstrap-icons-subset.mjs` (`pyftsubset` over
the package's own woff2) and committed, so no build lane grows a Python dependency and CI
keeps installing exactly what the lockfile says.

The selectors are copied from upstream v1.11.3 verbatim, so an existing `<i class="bi bi-x">`
renders identically — only glyphs nobody references are gone.

**Alternative rejected: subset during the build.** It buys nothing here (the icon set changes
a few times a year) and costs every lane, CI included, a Python toolchain that npm cannot
install.

## The failure mode this creates, and the gate that answers it

A generated asset that is committed goes stale silently: add `bi-rocket-takeoff` to a
template and it renders as a blank box, because the glyph is not in the subset. Nothing in
`ng test` can see that — that suite runs in a browser and cannot read the filesystem.

So `build-bootstrap-icons-subset.mjs --check` runs as a pre-hook of `prebuild`,
`prebuild:sit` and `prebuild:prod` (Node only, no Python): it compares the icons `src/` uses
against the ones the stylesheet declares, **and each rule's codepoint against
`bootstrap-icons.json`**. The codepoint half is not hypothetical — the first version of the
generator emitted `content: "${MAP[n].toString(16)}"` as a literal string, all 39 rules were
present and every icon rendered as raw text; the 6,918-test suite stayed green and only a
screenshot of the built bundle caught it.
