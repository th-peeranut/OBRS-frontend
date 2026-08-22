/**
 * WCAG contrast measurement for component specs (OBRS-726).
 *
 * Why this exists as a shared helper: OBRS-721 proved that a ratio the browser
 * computes is the only dark-mode evidence that survives review — the token gate
 * (`scripts/check-admin-theme-tokens.mjs`) can see that a token is declared and,
 * since OBRS-726, that a chip-half token is being used with no fill of its own,
 * but it cannot see what an element's ancestors actually PAINT. That answer only
 * exists at runtime. These specs run in ChromeHeadless with the real cascade
 * loaded by the karma `styles` array (`bootstrap.min.css`, `src/styles.scss` →
 * `admin-theme.scss` + `dark-theme.scss`), so `var()` resolves exactly as
 * production does.
 *
 * The maths was written inline in `override-cancel-modal.component.spec.ts` for
 * OBRS-721 and is imported from here now — one implementation, so a fix to the
 * compositing walk cannot be right in one spec and stale in another.
 */

/** AA floor for normal-size text. */
export const AA_NORMAL_TEXT = 4.5;
/** AA floor for large text (>=18.66px bold or >=24px) and non-text graphics. */
export const AA_LARGE_TEXT = 3.0;

export type Rgb = [number, number, number];

/** Parse a computed `rgb()`/`rgba()` string. Returns alpha 0 for anything else. */
export function rgba(colour: string): [number, number, number, number] {
  const m = colour.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0, 0];
  const p = m[1].split(',').map((v) => parseFloat(v.trim()));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

/** The computed text colour of an element. */
export function fgOf(element: Element): Rgb {
  return rgba(getComputedStyle(element).color).slice(0, 3) as Rgb;
}

/**
 * The background actually PAINTED behind an element: walk up compositing every
 * translucent layer onto its ancestor, stopping at the first opaque one.
 *
 * Without the compositing walk, `rgba(0, 0, 0, 0.03)` reads as an opaque
 * near-black and a dark-mode failure hides behind a flattering number
 * (OBRS-721). Falls back to white only when nothing in the chain paints at all,
 * which matches how a browser renders over the default canvas.
 */
export function effectiveBg(element: Element | null): Rgb {
  const layers: [number, number, number, number][] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    const c = rgba(getComputedStyle(node).backgroundColor);
    if (c[3] > 0) layers.push(c);
    if (c[3] >= 1) break;
  }
  if (layers.length === 0) return [255, 255, 255];
  let [r, g, b] = layers[layers.length - 1];
  for (let i = layers.length - 2; i >= 0; i--) {
    const [tr, tg, tb, ta] = layers[i];
    r = tr * ta + r * (1 - ta);
    g = tg * ta + g * (1 - ta);
    b = tb * ta + b * (1 - ta);
  }
  return [r, g, b];
}

/** WCAG 2.1 relative-luminance contrast ratio. */
export function contrast(fg: Rgb, bg: Rgb): number {
  const lum = ([r, g, b]: Rgb) => {
    const f = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(fg);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Contrast of an element's own text against whatever is painted behind it. */
export function measuredContrast(element: Element): number {
  return contrast(fgOf(element), effectiveBg(element));
}

/** `#rrggbb` of a measured colour — for putting real values in a failure message. */
export function toHex([r, g, b]: Rgb): string {
  return (
    '#' +
    [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
  );
}

/**
 * The colour a custom property resolves to AT a given element, as the browser
 * computes it — via a throwaway probe span, so `#673a00` and `rgb(103, 58, 0)`
 * never have to be compared as strings.
 *
 * Use this instead of `getPropertyValue('--x')`: that returns the declared TEXT
 * (with whatever spelling and casing the stylesheet used, and empty when the
 * token is undeclared, which is indistinguishable from "declared as nothing").
 */
export function resolveTokenColour(within: Element, token: string): Rgb {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  probe.style.display = 'none';
  within.appendChild(probe);
  const value = fgOf(probe);
  probe.remove();
  return value;
}

/**
 * Mount a fixture's host inside a real ancestor chain so the cascade resolves
 * the way it does in production, and return a teardown.
 *
 * `chain` is outermost-first, each entry a className for one wrapper div —
 * mirror the page's actual markup, not a simplification. An `--admin-*` token
 * only exists inside `.admin-shell`, and what an element's background resolves
 * to depends on every wrapper above it (a raw Bootstrap `.card` does NOT follow
 * the shell's dark mode unless the page opts in — see OBRS-128).
 *
 * `dark` toggles BOTH the shell's own `is-dark` (added to any chain entry that
 * names `admin-shell`) and `document.body.classList` — production does both:
 * `ThemeService` writes the body class while the shell component binds its own.
 */
export function mountInChain(
  hostElement: HTMLElement,
  chain: string[],
  dark: boolean
): () => void {
  const bodyWasDark = document.body.classList.contains('is-dark');
  if (dark) document.body.classList.add('is-dark');
  else document.body.classList.remove('is-dark');

  const hostParent = hostElement.parentElement;
  const wrappers = chain.map((className) => {
    const div = document.createElement('div');
    div.className = dark && /\badmin-shell\b/.test(className) ? `${className} is-dark` : className;
    return div;
  });
  wrappers.forEach((w, i) => {
    if (i === 0) document.body.appendChild(w);
    else wrappers[i - 1].appendChild(w);
  });
  (wrappers[wrappers.length - 1] ?? document.body).appendChild(hostElement);

  return () => {
    // OBRS-1527 — with an empty `chain` nothing is wrapped, so `wrappers[0]` is
    // `undefined` and the host appended straight to `body` above was never taken
    // back out. Measured 2026-08-22 in a full `ng test`: six
    // `.p-menu.my-bookings-action-menu` hosts left standing at 48px each, which
    // is enough to push the document past the viewport for whichever geometry
    // spec the shuffle happened to run next.
    if (wrappers.length > 0) wrappers[0].remove();
    else if (hostParent) hostParent.appendChild(hostElement);
    else hostElement.remove();
    if (bodyWasDark) document.body.classList.add('is-dark');
    else document.body.classList.remove('is-dark');
  };
}
