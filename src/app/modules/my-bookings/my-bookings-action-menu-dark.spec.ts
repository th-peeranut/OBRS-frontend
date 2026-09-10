import { AA_NORMAL_TEXT, effectiveBg, measuredContrast, mountInChain, toHex } from '../../testing/contrast';

/**
 * OBRS-959 — the `/my-bookings` "..." action menu in dark mode.
 *
 * The subject is `src/styles/dark-theme.scss`, which no component owns, and the
 * popup it styles is `appendTo="body"` — so this is a cross-cutting DOM spec in
 * the shape of `admin-shell-chrome-contrast.spec.ts`, not a component spec.
 * Karma loads `src/styles.scss` (→ `dark-theme.scss`), so the rules under test
 * are live here exactly as the app cascades them.
 *
 * Why it asserts a COLOUR and not a class: before this card the popup already
 * had a dark rule — for the disabled-reason tooltip only — so "the menu has
 * dark styling" was true and still white. Measured on `origin/dev` 2026-08-22
 * with the panel open on SIT data: background `rgb(255,255,255)` and label
 * `rgb(53,60,68)` in BOTH modes, with the two panel crops byte-identical.
 *
 * PrimeNG's own theme CSS is injected at runtime by `providePrimeNG()` and no
 * spec bootstraps it, so in light mode the panel here paints nothing and
 * `effectiveBg` composites down to the page white — which is what the live
 * light run measured anyway. The dark half is what this spec pins.
 */

/** The popup as PrimeNG really renders it, with our pTemplate content inside. */
function buildMenu(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'p-menu my-bookings-action-menu';
  panel.innerHTML = `
    <ul class="p-menu-list">
      <li class="p-menu-item">
        <div class="p-menu-item-content">
          <div class="action-menu-item">
            <span class="action-menu-item__icon-slot"><i class="bi bi-arrow-repeat"></i></span>
            <span class="action-menu-item__label">เลื่อนการเดินทาง</span>
          </div>
        </div>
      </li>
      <li class="p-menu-item">
        <div class="p-menu-item-content">
          <div class="action-menu-item action-menu-item--danger">
            <span class="action-menu-item__icon-slot"><i class="bi bi-x-circle"></i></span>
            <span class="action-menu-item__label">ยกเลิกการจอง</span>
          </div>
        </div>
      </li>
    </ul>`;
  return panel;
}

/** Mount the popup where PrimeNG puts it — directly under `<body>`, no wrappers. */
function withMenu<T>(dark: boolean, read: (panel: HTMLElement) => T): T {
  const panel = buildMenu();
  const teardown = mountInChain(panel, [], dark);
  try {
    return read(panel);
  } finally {
    teardown();
  }
}

describe('my-bookings action menu — dark mode (OBRS-959)', () => {
  it('paints its own surface in dark mode, different from light', () => {
    const light = withMenu(false, (panel) => getComputedStyle(panel).backgroundColor);
    const dark = withMenu(true, (panel) => getComputedStyle(panel).backgroundColor);

    expect(dark)
      .withContext(
        `panel background is ${dark} in dark mode and ${light} in light mode — ` +
          `identical means the popup is still wearing PrimeNG's light surface, which is ` +
          `exactly what OBRS-959 filed (measured rgb(255,255,255) in both).`
      )
      .not.toBe(light);
  });

  it('reads the dark card surface, not a transparent pass-through', () => {
    const bg = withMenu(true, (panel) => effectiveBg(panel));
    // $dk-bg-card. Pinned as a value because "not equal to light" alone would
    // also pass on a panel painted some arbitrary colour.
    expect(toHex(bg)).toBe('#1a1d27');
  });

  [
    { name: 'neutral row', selector: '.action-menu-item:not(.action-menu-item--danger) .action-menu-item__label' },
    { name: 'danger row', selector: '.action-menu-item--danger .action-menu-item__label' },
    { name: 'icon gutter', selector: '.action-menu-item__icon-slot' },
  ].forEach(({ name, selector }) => {
    it(`${name}: clears AA against the dark panel`, () => {
      const ratio = withMenu(true, (panel) => {
        const element = panel.querySelector(selector);
        if (!element) throw new Error(`no element for ${selector}`);
        return measuredContrast(element);
      });
      expect(ratio)
        .withContext(`${name} measured ${ratio.toFixed(2)}:1 on the dark panel`)
        .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });
});
