import { mountInChain, rgba, resolveTokenColour, toHex } from '../testing/contrast';

/**
 * OBRS-1331 — the admin tab strip must stay readable when it WRAPS.
 *
 * Same technique and same subject as admin-shell-chrome-contrast.spec.ts: the thing under
 * test is `src/styles/admin-theme.scss`, which no component owns, and Karma already loads
 * `src/styles.scss` so the rules are live here exactly as they are in the app.
 *
 * What broke: Bootstrap draws the line that says "this panel belongs to that tab" ONCE, on
 * the `<ul>` (`border-bottom`), and lets the active tab erase its own 1px of it by sitting
 * `margin-bottom: -1px` on top. Both only ever reach the LAST row. `.nav` is
 * `flex-wrap: wrap`, so when OBRS-1308 made /admin/settings seven tabs the strip wrapped,
 * the active tab landed on row 1 with nothing under it to erase, and the line ran under a
 * row of tabs nobody had selected — the tab metaphor inverted.
 *
 * These specs are geometry-relative on purpose. They force the wrap with an explicit
 * container width instead of asserting the px width of any label, because label widths
 * depend on Sarabun having loaded and this suite must not go red on a machine that cannot
 * reach Google Fonts.
 */

const TAB_LABELS = [
  'Booking Policy',
  'Reminder Timing',
  'Jump Seat',
  'Parcel Revenue Share',
  'Driver Cash Rates',
  'Notification Messages',
  'Config Change History',
];

interface Strip {
  readonly ul: HTMLElement;
  readonly links: readonly HTMLElement[];
  readonly teardown: () => void;
}

/** Builds the real markup system-settings-page.component.html renders, at a fixed width. */
function mountStrip(widthPx: number, dark = false): Strip {
  // Taken out of flow: `.admin-shell` carries its own layout, and a host that merely
  // *asks* for 2000px still got squeezed by it — the no-wrap control read 2 rows and the
  // spec would have "passed" the wrap cases for the wrong reason.
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';

  const ul = document.createElement('ul');
  ul.className = 'nav nav-tabs';
  ul.setAttribute('role', 'tablist');
  ul.style.width = `${widthPx}px`;
  ul.style.minWidth = `${widthPx}px`;

  const links = TAB_LABELS.map((label, i) => {
    const li = document.createElement('li');
    li.className = 'nav-item';
    const a = document.createElement('a');
    a.className = i === 0 ? 'nav-link active' : 'nav-link';
    a.setAttribute('role', 'tab');
    a.textContent = label;
    li.appendChild(a);
    ul.appendChild(li);
    return a;
  });

  host.appendChild(ul);
  const teardown = mountInChain(host, [dark ? 'admin-shell is-dark' : 'admin-shell'], dark);
  return { ul, links, teardown };
}

/** Distinct rounded `top` values = how many rows the flex container wrapped into. */
function rowCount(links: readonly HTMLElement[]): number {
  return new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size;
}

function isTransparent(colour: string): boolean {
  return rgba(colour)[3] === 0;
}

describe('admin shell tab strip — wrapping (OBRS-1331)', () => {
  it('every tab carries its own bottom border, so every ROW has a baseline', () => {
    const { links, teardown } = mountStrip(400);
    try {
      const inactive = links[1];
      const colour = getComputedStyle(inactive).borderBottomColor;
      expect(isTransparent(colour))
        .withContext(
          'A non-active .nav-link must paint its own border-bottom. While it was ' +
            'transparent the ONLY baseline was the one on the <ul>, which reaches the ' +
            'last row only — that is the whole defect. Measured: ' +
            colour
        )
        .toBe(false);
      expect(toHex(rgba(colour).slice(0, 3) as [number, number, number])).toBe(
        toHex(resolveTokenColour(inactive, '--admin-outline'))
      );
    } finally {
      teardown();
    }
  });

  it('when the strip wraps, the active tab is NOT on the row the <ul>’s line is under', () => {
    const { ul, links, teardown } = mountStrip(400);
    try {
      // Guard: if this ever stops wrapping the rest of the spec proves nothing.
      expect(rowCount(links))
        .withContext('400px must not fit 7 tabs; without a wrap this spec is vacuous')
        .toBeGreaterThan(1);

      const active = links[0];
      const gap = ul.getBoundingClientRect().bottom - active.getBoundingClientRect().bottom;
      expect(gap)
        .withContext(
          'The <ul>’s border-bottom sits a full row (or more) below the active tab. ' +
            'This is WHY it cannot be the connector — measured 39.4px on /admin/settings ' +
            'at the reported window size. The fix is not to move this line; it is to give ' +
            'the active tab a baseline on its own row.'
        )
        .toBeGreaterThan(active.getBoundingClientRect().height - 1);
    } finally {
      teardown();
    }
  });

  it('the active tab still opens into what is below it, on whatever row it is on', () => {
    const { links, teardown } = mountStrip(400);
    try {
      const active = links[0];
      const activeBottom = getComputedStyle(active).borderBottomColor;
      expect(toHex(rgba(activeBottom).slice(0, 3) as [number, number, number]))
        .withContext(
          'The active tab erases its own segment of its row’s baseline (card colour), ' +
            'which is what reads as "selected". Before OBRS-1331 it erased a line that was ' +
            'not on its row, so it erased nothing and rendered as a floating box.'
        )
        .toBe(toHex(resolveTokenColour(active, '--admin-surface-card')));

      // Its row-mates keep theirs, so the row still reads as one continuous baseline
      // broken only under the selected tab.
      const activeTop = Math.round(active.getBoundingClientRect().top);
      const rowMates = links.filter(
        (a) => a !== active && Math.round(a.getBoundingClientRect().top) === activeTop
      );
      expect(rowMates.length).toBeGreaterThan(0);
      rowMates.forEach((mate) => {
        expect(isTransparent(getComputedStyle(mate).borderBottomColor))
          .withContext(`row-mate "${mate.textContent}" must paint the baseline`)
          .toBe(false);
      });
    } finally {
      teardown();
    }
  });

  it('a strip that does NOT wrap is unchanged — parcel-schedule-tabs / parcel-consign', () => {
    // 2000px fits all 7, so this stands in for the 2-4 tab strips that never wrap. The
    // point is the blast-radius claim: `margin-bottom: -1px` lands each tab's new border
    // on the <ul>'s own line, same token, same pixel.
    const { ul, links, teardown } = mountStrip(2000);
    try {
      expect(rowCount(links))
        .withContext('2000px must fit all 7 tabs on one row')
        .toBe(1);

      const inactive = links[1];
      const delta = Math.abs(
        ul.getBoundingClientRect().bottom - inactive.getBoundingClientRect().bottom
      );
      expect(delta)
        .withContext(
          'On a single-row strip the tab’s own bottom border must coincide with the ' +
            '<ul>’s, or OBRS-1331 would have changed the look of two pages that never ' +
            'had the bug.'
        )
        .toBeLessThanOrEqual(1);
    } finally {
      teardown();
    }
  });

  it('holds in dark mode too — the tokens carry both values, the geometry is mode-free', () => {
    const { links, teardown } = mountStrip(400, true);
    try {
      const inactive = links[1];
      expect(isTransparent(getComputedStyle(inactive).borderBottomColor)).toBe(false);
      expect(toHex(rgba(getComputedStyle(inactive).borderBottomColor).slice(0, 3) as [number, number, number]))
        .toBe(toHex(resolveTokenColour(inactive, '--admin-outline')));
    } finally {
      teardown();
    }
  });
});
