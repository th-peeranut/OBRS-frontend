import {
  AA_NORMAL_TEXT,
  contrast,
  effectiveBg,
  fgOf,
  measuredContrast,
  mountInChain,
  resolveTokenColour,
  toHex,
} from '../testing/contrast';

/**
 * OBRS-755 — contrast of the admin/staff shell CHROME (sidebar, tab strip, the
 * Bootstrap colour utilities used inside the shell).
 *
 * A cross-cutting spec with no single component owner, like nav-reachability.spec.ts:
 * the subject is `src/styles/admin-theme.scss`, which no component owns. Karma already
 * loads `src/styles.scss`, so these rules are live here exactly as they are in the app
 * (the technique proven in OBRS-721/726/747).
 *
 * Why this file exists at all: every failure it pins was ALREADY below AA when the
 * OBRS-747 sweep found it, on every page of both shells, and nothing caught it. Two of
 * them were introduced by a11y work — OBRS-741 darkened `--accent-strong` so white text
 * could sit ON it, which pushed the sidebar pin USING it as a foreground from 3.93:1
 * down to 2.27:1. A number nobody re-measures is a number that drifts.
 */

interface Variant {
  readonly name: string;
  readonly shell: string;
  /** What `--accent-text` was before OBRS-755, and what it measured. For the failure message. */
  readonly wasLight: string;
  readonly wasRatio: number;
}

const VARIANTS: readonly Variant[] = [
  { name: 'theme-staff', shell: 'admin-shell theme-staff', wasLight: '#0f766e', wasRatio: 4.24 },
  { name: 'theme-admin', shell: 'admin-shell theme-admin', wasLight: '#b3420a', wasRatio: 4.37 },
  // The un-suffixed shell: no variant class. Its --accent-text already cleared AA
  // (6.32:1) so OBRS-755 left it alone — pinned here so "left alone" stays a measured
  // claim rather than an assumption.
  { name: 'default (no variant class)', shell: 'admin-shell', wasLight: '#075c7a', wasRatio: 6.32 },
];

/** The sidebar chain as the page really builds it (see the OBRS-747 sweep selectors). */
const SIDEBAR_CHAIN = (shell: string) => [shell, 'admin-sidebar', 'admin-sidebar-panel'];

function el(tag: string, className: string, text = 'ตารางเดินรถ'): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

describe('admin shell chrome — active sidebar item (OBRS-755)', () => {
  VARIANTS.forEach((variant) => {
    [false, true].forEach((dark) => {
      it(`${variant.name}: .admin-nav-link.active clears AA in ${dark ? 'dark' : 'light'} mode`, () => {
        const link = el('a', 'admin-nav-link active');
        const nav = document.createElement('nav');
        nav.className = 'admin-nav';
        nav.appendChild(link);
        const teardown = mountInChain(nav, SIDEBAR_CHAIN(variant.shell), dark);
        try {
          const ratio = measuredContrast(link);
          expect(ratio)
            .withContext(
              `${variant.name} ${dark ? 'dark' : 'light'}: ${toHex(
                resolveTokenColour(link, '--accent-text')
              )} on painted ${toHex(effectiveBg(link))} = ${ratio.toFixed(2)}:1. ` +
                `Light mode measured ${variant.wasRatio}:1 with the pre-OBRS-755 ` +
                `${variant.wasLight}; that is the regression this pins.`
            )
            .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        } finally {
          teardown();
        }
      });
    });
  });
});

describe('admin shell chrome — the accent-as-text token (OBRS-755)', () => {
  // The sidebar pin's own rule lives inside `@media (min-width: 1101px)`, which karma's
  // viewport does not satisfy, so mounting the button here would measure the BASE rule
  // (--admin-muted) and pass for the wrong reason. What the pin rule actually depends on
  // is the token pair, so that is what is measured: --accent-text as a foreground on the
  // painted sidebar. The rule itself is one token reference, verified in the browser by
  // e2e/scripts/capture-obrs747.js (2.27:1 -> 9.94:1 staff, 2.84:1 -> 6.50:1 admin).
  VARIANTS.forEach((variant) => {
    it(`${variant.name}: --accent-text has its own dark value`, () => {
      const probeHost = el('div', 'admin-sidebar-panel-probe', '');
      const lightTeardown = mountInChain(probeHost, SIDEBAR_CHAIN(variant.shell), false);
      const light = toHex(resolveTokenColour(probeHost, '--accent-text'));
      lightTeardown();

      const darkTeardown = mountInChain(probeHost, SIDEBAR_CHAIN(variant.shell), true);
      const dark = toHex(resolveTokenColour(probeHost, '--accent-text'));
      darkTeardown();

      expect(dark)
        .withContext(
          `${variant.name}: --accent-text resolved to ${light} in light and ${dark} in dark. ` +
            'A token with one value for both modes is exactly what --accent-strong is, and ' +
            'why using THAT one as a foreground painted 2.27:1 dark-on-dark (OBRS-755).'
        )
        .not.toBe(light);
    });

    it(`${variant.name}: --accent-text clears AA on the painted dark sidebar`, () => {
      const host = el('span', 'admin-nav-probe', '');
      const teardown = mountInChain(host, SIDEBAR_CHAIN(variant.shell), true);
      try {
        const fg = resolveTokenColour(host, '--accent-text');
        const bg = effectiveBg(host);
        const ratio = contrast(fg, bg);
        expect(ratio)
          .withContext(`${variant.name} dark: ${toHex(fg)} on ${toHex(bg)} = ${ratio.toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      } finally {
        teardown();
      }
    });
  });
});

describe('admin shell chrome — Bootstrap surfaces inside the shell (OBRS-755)', () => {
  [false, true].forEach((dark) => {
    it(`.nav-tabs .nav-link clears AA in ${dark ? 'dark' : 'light'} mode`, () => {
      const button = el('button', 'nav-link', 'ตรวจรับ');
      const item = document.createElement('li');
      item.className = 'nav-item';
      item.appendChild(button);
      const strip = document.createElement('ul');
      strip.className = 'nav nav-tabs';
      strip.appendChild(item);

      const teardown = mountInChain(strip, ['admin-shell theme-staff', 'container-fluid'], dark);
      try {
        const ratio = measuredContrast(button);
        expect(ratio)
          .withContext(
            `${dark ? 'dark' : 'light'}: ${toHex(fgOf(button))} on ${toHex(
              effectiveBg(button)
            )} = ${ratio.toFixed(2)}:1. Raw Bootstrap #0d6efd measured 4.26:1 in light and ` +
              '3.97:1 in dark; OBRS-747 fixed only dark, which is why this test covers BOTH.'
          )
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      } finally {
        teardown();
      }
    });

    it(`.text-success on the themed card clears AA in ${dark ? 'dark' : 'light'} mode`, () => {
      // The amount a salesperson reads back while taking cash (/staff/sell checkout).
      const amount = el('span', 'fw-semibold text-success', 'THB 1,600.00');
      const teardown = mountInChain(
        amount,
        ['admin-shell theme-staff', 'container-fluid', 'card', 'card-body'],
        dark
      );
      try {
        const ratio = measuredContrast(amount);
        expect(ratio)
          .withContext(
            `${dark ? 'dark' : 'light'}: ${toHex(fgOf(amount))} on ${toHex(
              effectiveBg(amount)
            )} = ${ratio.toFixed(2)}:1. Bootstrap's own #198754 measured 3.54:1 dark and ` +
              '4.30:1 light here — below AA in BOTH modes, which is why the fix is not ' +
              'scoped to .is-dark.'
          )
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      } finally {
        teardown();
      }
    });
  });

  it('.text-success resolves to the GREEN accepted token, not the blue success one', () => {
    // AC3: the token choice is the decision, and a ratio alone cannot see it — blue would
    // pass AA just as well while silently changing what the colour MEANS to the cashier.
    const amount = el('span', 'fw-semibold text-success', 'THB 1,600.00');
    const teardown = mountInChain(
      amount,
      ['admin-shell theme-staff', 'container-fluid', 'card', 'card-body'],
      true
    );
    try {
      const painted = toHex(fgOf(amount));
      expect(painted)
        .withContext(
          `.text-success painted ${painted}; expected --admin-accepted-fg ` +
            `${toHex(resolveTokenColour(amount, '--admin-accepted-fg'))} (green), not ` +
            `--admin-success-fg ${toHex(resolveTokenColour(amount, '--admin-success-fg'))} (blue).`
        )
        .toBe(toHex(resolveTokenColour(amount, '--admin-accepted-fg')));
    } finally {
      teardown();
    }
  });
});

/**
 * OBRS-1446 — the sidebar section header has to read as a header in Thai too.
 *
 * The header separated itself from the links with three things: smaller, plus
 * `text-transform: uppercase`, plus `letter-spacing`. Measured on SIT 2026-08-19,
 * `uppercase` is a complete no-op on all five Thai headers (`s.toUpperCase() === s`),
 * and Thai is the app default — so on the screen most users see, the design was down
 * to "smaller and fainter", which reads as a de-emphasised menu item, not a label.
 *
 * What this pins is the two replacement signals, both script-independent: a rule above
 * the header, and a top:bottom space ratio that makes proximity bind the header to the
 * group BELOW it. A ratio test alone cannot see either — that is why they are here and
 * not left to the eye.
 */
describe('admin shell chrome — nav section header (OBRS-1446)', () => {
  /** The real shape: header, its links, then the next header. `:first-child` matters. */
  function buildNav(): { nav: HTMLElement; first: HTMLElement; second: HTMLElement } {
    const nav = document.createElement('nav');
    nav.className = 'admin-nav';
    const first = el('p', 'admin-nav-section-title', 'ภาพรวม');
    const second = el('p', 'admin-nav-section-title', 'ข้อมูลหลัก');
    nav.appendChild(first);
    nav.appendChild(el('a', 'admin-nav-link'));
    nav.appendChild(second);
    nav.appendChild(el('a', 'admin-nav-link'));
    return { nav, first, second };
  }

  [false, true].forEach((dark) => {
    const mode = dark ? 'dark' : 'light';

    it(`clears AA in ${mode} mode`, () => {
      const { nav, second } = buildNav();
      const teardown = mountInChain(nav, SIDEBAR_CHAIN('admin-shell theme-admin'), dark);
      try {
        const ratio = measuredContrast(second);
        expect(ratio)
          .withContext(
            `${mode}: ${toHex(fgOf(second))} on painted ${toHex(effectiveBg(second))} = ` +
              `${ratio.toFixed(2)}:1. Light measured 5.62:1 before this card and the colour ` +
              'is unchanged; this pins that the added border did not move it.'
          )
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      } finally {
        teardown();
      }
    });

    it(`carries a visible rule above it in ${mode} mode — the signal that survives Thai`, () => {
      const { nav, first, second } = buildNav();
      const teardown = mountInChain(nav, SIDEBAR_CHAIN('admin-shell theme-admin'), dark);
      try {
        const width = parseFloat(getComputedStyle(second).borderTopWidth);
        expect(width)
          .withContext(
            `${mode}: border-top-width measured ${width}px, style ` +
              `${getComputedStyle(second).borderTopStyle}. Without it the only thing left ` +
              'saying "header" is uppercase, which does nothing in Thai.'
          )
          .toBeGreaterThan(0);

        // The first header sits under the nav search box, already a boundary of its own.
        expect(parseFloat(getComputedStyle(first).borderTopWidth))
          .withContext('the first header must not double the line under the nav search box')
          .toBe(0);
      } finally {
        teardown();
      }
    });
  });

  it('sits closer to the group below it than to the one above', () => {
    const { nav, second } = buildNav();
    const teardown = mountInChain(nav, SIDEBAR_CHAIN('admin-shell theme-admin'), false);
    try {
      const above = (second.previousElementSibling as HTMLElement).getBoundingClientRect();
      const header = second.getBoundingClientRect();
      const below = (second.nextElementSibling as HTMLElement).getBoundingClientRect();
      const gapAbove = header.top - above.bottom;
      const gapBelow = below.top - header.bottom;
      expect(gapAbove)
        .withContext(
          `space above the header ${gapAbove}px vs below ${gapBelow}px. It shipped at ` +
            '18px : 8px — 2.25:1, too weak for proximity to say which group the header ' +
            'belongs to. (OBRS-1446 recorded 12px : 8px from the margins alone; the top ' +
            "gap also carries .admin-nav's 6px flex gap, which the card did not count.) " +
            'The factor of 3 is what separates the two designs, so it is the threshold.'
        )
        .toBeGreaterThanOrEqual(gapBelow * 3);
    } finally {
      teardown();
    }
  });
});
