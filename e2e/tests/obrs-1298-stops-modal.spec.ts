/**
 * QA verification for OBRS-1298 — /admin/stops: the edit form moved into a modal, and the
 * table row is now clickable.
 *
 * LANE: OWN-DB, declared in e2e/lanes.json, run by playwright.obrs1298qa.config.ts. An earlier
 * revision of this header claimed the spec was deliberately wired into no lane at all; that was
 * wrong and CI said so — scripts/check-e2e-lanes.mjs rejects an undeclared spec outright ("a spec
 * that belongs to no lane runs in no lane"), and it is right to: staying out of the registry does
 * not keep a spec out of the merge gate, it only keeps the next reader from knowing what this
 * file needs in order to be true. It is still not in the GATE lane and still not run by
 * playwright.config.ts (whose testMatch is an explicit SIT_SPECS list). Run it with:
 *
 *   npx playwright test --config=playwright.obrs1298qa.config.ts
 *
 * LANE: LOCAL backend, not SIT (coordinator redirect, live SIT login outage OBRS-1307 —
 * reproduced independently by this session and the coordinator: every seeded account's
 * /api/auth/login returns a fast 500 UNEXPECTED_ERROR on the live SIT deployment). This targets a
 * local Spring Boot instance (`./mvnw spring-boot:run -Dspring-boot.run.profiles=dev,local`,
 * apiUrl http://localhost:8080) against the machine's native Postgres — a private DB, not shared
 * SIT data, so AC5a/AC5b are free to mutate rows without the SIT-sweep discipline other specs in
 * this repo use (see e2e/support/sit-sweep.ts, which does not apply here).
 *
 * WHY A REAL LOGIN, NOT storageState('../fixtures/admin-auth.json')
 * That fixture is produced by e2e/global-setup.ts logging into the live SIT backend, which is
 * both the outage above and the wrong backend for this lane. This file logs in through the real
 * UI against localhost:8080 instead.
 */

import { test, expect, Page } from '@playwright/test';

const OWNER_EMAIL = 'owner@system.local';
const OWNER_PASSWORD = 'P@ssw0rd';

async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.fill('#email', OWNER_EMAIL);
  await page.fill('#password', OWNER_PASSWORD);
  // Enter, not a click on .login-btn: a fixed PDPA-consent banner can sit over the button in
  // some viewport heights, and Enter reaches the reactive form's submit handler regardless.
  await page.press('#password', 'Enter');
  // SIT cold-starts have been observed to take up to ~100s under load (office memory:
  // "recovery order... a ~16s cold-start 200 is fine"; this session measured worse). Generous
  // on purpose — a real failure should surface as the assertion below timing out with a clear
  // "still on /login" message, not as a false negative from an impatient timeout.
  // Local lane: login measured 0.7-1.9s (coordinator's readiness check), so 20s is generous
  // without masquerading a real failure as a long hang.
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20_000 });
}

/**
 * Same pattern e2e/tests/admin-critical-paths.spec.ts uses (`dismissSweetAlert`): force-click the
 * confirm button, THEN wait for the whole container to actually leave the DOM, rather than firing
 * the click and moving on. An earlier version of this file did the latter and it left a stale
 * `.swal2-container` intercepting pointer events for the rest of the test — the click landed, but
 * SweetAlert2's own exit animation/teardown hadn't finished, so the backdrop kept blocking every
 * subsequent click until the 120s test timeout.
 */
async function dismissSweetAlertIfPresent(page: Page): Promise<void> {
  const confirmBtn = page.locator('.swal2-confirm');
  if (!(await confirmBtn.count({ timeout: 8_000 }).catch(() => 0))) {
    return;
  }
  await confirmBtn.click({ force: true });
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 10_000 });
}

test.describe('Admin — Stops modal (OBRS-1298)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/admin/stops', { waitUntil: 'networkidle' });
    await page.waitForSelector('table.admin-table tbody tr.stop-row', { timeout: 20_000 });
  });

  test('AC2 — clicking a row opens the modal for that stop and highlights the row', async ({
    page,
  }) => {
    const firstRow = page.locator('tr.stop-row').first();
    const slug = (await firstRow.locator('td code').innerText()).trim();

    // Click the name cell, not the row element itself, to prove the whole row is the
    // activation target (not just some listener bound to the <tr>).
    await firstRow.locator('td').nth(1).click();

    const modal = page.locator('.admin-modal-backdrop .admin-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.admin-modal-title')).toContainText(slug);
    await expect(firstRow).toHaveClass(/is-selected/);

    // A typo'd selector must fail loudly: assert there is exactly one modal, not "at least one".
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(1);
  });

  test('AC3 — the แก้ไข button still opens exactly one modal, and drag-select does not', async ({
    page,
  }) => {
    const firstRow = page.locator('tr.stop-row').first();
    await firstRow.locator('button').click();
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(1);
    const slug = (await firstRow.locator('td code').innerText()).trim();
    await expect(page.locator('.admin-modal-title')).toContainText(slug);
    // Close before the next assertion so it starts from a clean slate.
    await page.keyboard.press('Escape');
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(0);

    // Drag-select text inside a different row's cell — must NOT open a modal.
    const secondRow = page.locator('tr.stop-row').nth(1);
    const nameCell = secondRow.locator('td').nth(1);
    const box = await nameCell.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
    }
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(0);
  });

  test('AC4-i — REAL FINDING: focus does not land inside the dialog on optimistic open', async ({
    page,
  }) => {
    // AdminModalBackdropDirective.ngOnInit (shared directive, unrelated to this card's own code)
    // computes its focus target ONCE, at mount: `dialog.querySelector('input, select, textarea,
    // button, [tabindex]...')`, and calls `(focusable ?? dialog).focus?.()`. OBRS-1298's modal is
    // the first admin modal that mounts BEFORE its content is ready (the optimistic-open +
    // skeleton this card added on purpose, AC5d) — at the instant ngOnInit runs, `.admin-modal`
    // contains only a title and a skeleton div, no focusable element, so `dialog.focus()` is
    // called on a plain <div> with no tabindex, which per the HTML spec is a no-op. Confirmed
    // measured below, at both the optimistic instant AND after the real form has rendered —
    // ngOnInit does not re-run, so focus never moves in for the rest of the modal's life either.
    const editButton = page.locator('tr.stop-row').first().locator('button');
    await editButton.focus();
    await page.keyboard.press('Enter');

    const modal = page.locator('.admin-modal-backdrop .admin-modal');
    await expect(modal).toBeVisible();

    const focusCheck = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('.admin-modal');
        return {
          insideDialog: !!dialog && dialog.contains(document.activeElement),
          activeTag: document.activeElement?.tagName,
          activeClass: (document.activeElement as HTMLElement | null)?.className,
        };
      });
    const immediateFocus = await focusCheck();
    console.log('AC4 focus immediately after open:', immediateFocus);

    await page.waitForSelector('#stopProvince', { timeout: 15_000 });
    const afterLoadFocus = await focusCheck();
    console.log('AC4 focus after detail loaded:', afterLoadFocus);

    // Measured and reproducible on this run: focus stays on the trigger button the whole time.
    // This assertion documents the FINDING (asserts the broken state) rather than asserting the
    // originally-hoped-for behaviour, so a future fix turns this red on purpose — flip it back to
    // `.toBe(true)` once the directive re-attempts focus after content settles.
    expect(
      immediateFocus.insideDialog || afterLoadFocus.insideDialog,
      JSON.stringify({ immediateFocus, afterLoadFocus })
    ).toBe(false);

    await page.keyboard.press('Escape');
  });

  test('AC4-ii — Escape closes the modal and returns focus to the trigger (independent of AC4-i)', async ({
    page,
  }) => {
    const editButton = page.locator('tr.stop-row').first().locator('button');
    await editButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.admin-modal-backdrop .admin-modal')).toBeVisible();
    await page.waitForSelector('#stopProvince', { timeout: 15_000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(0);

    // Focus returns to the button that opened it — this half of the directive's contract holds
    // regardless of AC4-i (ngOnDestroy unconditionally calls `this.previouslyFocused?.focus?.()`,
    // and previouslyFocused was correctly captured as the trigger button since IT held focus at
    // mount time, unaffected by whether focus ever moved INTO the dialog).
    const returnedToTrigger = await editButton.evaluate((el) => el === document.activeElement);
    expect(returnedToTrigger).toBe(true);
  });

  test('AC5a — saving a text field does not clobber an existing photo URL', async ({ page }) => {
    // Every seeded local stop already carries a primaryPhotoUrl (measured directly via GET
    // /api/stops/{id} for ids 1-5 — placehold.co placeholders or a real Google Places photo, e.g.
    // id 2 talat_nueang_chamnong). An earlier version of this test checked GET /api/stops (the
    // LIST/summary endpoint) and saw 0/28 with a photo — that was checking the wrong shape:
    // AdminStopSummaryDto omits primaryPhotoUrl entirely; only the per-id detail DTO carries it.
    // So no upload precondition is needed — use row index 3 as-is (avoiding the row-0 contention
    // every other test in this file uses).
    //
    // Separately measured and worth recording: attempting a FRESH photo upload on this local
    // lane (input[type=file] -> a generated 1x1 PNG) surfaced a real SweetAlert error, "an
    // unexpected error occurred", on every attempt — almost certainly a local file-storage/S3
    // config gap in this ad hoc local backend rather than a regression from OBRS-1298 (this diff
    // does not touch upload code, and the coordinator's setup notes said nothing about storage).
    // Not chasing that further — it blocks nothing this AC needs once the upload step is dropped.
    const targetRow = page.locator('tr.stop-row').nth(3);
    await targetRow.locator('button').click();
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(1);
    await expect(page.locator('.admin-modal .admin-skeleton')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('.stop-photo-preview img, img.stop-photo-preview')).toHaveCount(1, {
      timeout: 15_000,
    });
    const photoUrlBefore = await page
      .locator('.stop-photo-preview img, img.stop-photo-preview')
      .first()
      .getAttribute('src');
    expect(photoUrlBefore, 'this row is expected to already have a seeded photo').toBeTruthy();

    const thLandmark = page.locator('#stopLandmark-th');
    const original = await thLandmark.inputValue();
    const typed = `${original} QA-1298-temp`;
    await thLandmark.fill(typed);
    await page.locator('form.admin-form-grid button[type="submit"]').click();
    await dismissSweetAlertIfPresent(page);

    // stops.mappers.ts's toStopUpdatePayload trims every translation field before it is ever
    // POSTed (`description: t.description.trim()`), so the value that survives a save + re-read
    // is the TRIMMED typed string, not the raw one — expected client-side normalization, not the
    // server-trim AC5b covers separately with a padded LABEL instead.
    await expect(page.locator('#stopLandmark-th')).toHaveValue(typed.trim(), { timeout: 15_000 });

    const photoUrlAfter = await page
      .locator('.stop-photo-preview img, img.stop-photo-preview')
      .first()
      .getAttribute('src');
    expect(photoUrlAfter, 'the photo must survive a text-only save (OBRS-580)').toBe(photoUrlBefore);
  });

  test('AC5b — save re-reads from the server (trims whitespace)', async ({ page }) => {
    const firstRow = page.locator('tr.stop-row').first();
    await firstRow.locator('button').click();
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(1);

    const thLabel = page.locator('#stopLabel-th');
    const original = await thLabel.inputValue();
    await thLabel.fill(`  ${original}  `);
    await page.locator('form.admin-form-grid button[type="submit"]').click();
    await dismissSweetAlertIfPresent(page);

    // After the re-read, the field must show the TRIMMED value, not the padded one typed —
    // that is the proof the page re-fetched rather than trusting the local form.
    await expect(page.locator('#stopLabel-th')).toHaveValue(original, { timeout: 15_000 });
  });

  test('AC5c-i — REAL FINDING: the modal backdrop physically blocks the topbar language switcher', async ({
    page,
  }) => {
    // Measured from source before writing this: src/styles/admin-theme.scss sets
    // .admin-modal-backdrop { z-index: 1200 } (line ~1901) while the admin topbar — which hosts
    // <app-lang-switcher> — sits at z-index 35-40 (lines ~2169/2409/2425). The backdrop is
    // position:fixed and covers the full viewport, so with any admin modal open (this one
    // included — this is the SHARED [adminModalBackdrop] directive, not something OBRS-1298
    // wrote) a real mouse click at the switcher's on-screen coordinates lands on the backdrop,
    // not the switcher, and per AdminModalBackdropDirective.onBackdropClick that DISMISSES the
    // modal instead of doing anything to the language. Confirmed by the no-force click below:
    // it hits the backdrop and closes the modal, not the switcher. Pre-existing architecture,
    // not a regression this card introduced — but it means the literal brief scenario ("click
    // the in-app language switcher while the modal is open") cannot happen for a mouse user on
    // ANY admin modal today, this one included.
    await page.locator('tr.stop-row').first().locator('button').click();
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(1);

    await page.locator('.navbar-lang-trigger').click({ timeout: 5_000 }).catch(() => null);
    // The click above either timed out (never became actionable, because the backdrop intercepts
    // it — the normal case) or landed on the backdrop itself and dismissed the modal. Either way
    // the switcher's dropdown never opened, and the modal did NOT stay open through a real click.
    const dropdownOpened = await page.locator('.navbar-lang-menu').count();
    expect(dropdownOpened, 'language dropdown must not have opened — the backdrop ate the click').toBe(0);
  });

  test('AC5c-ii — the underlying "modal stays open across a language change" logic works when the switch is reachable', async ({
    page,
  }) => {
    // Isolates the COMPONENT logic from the z-index finding above. Playwright's click({force:
    // true}) still dispatches a real screen-coordinate mouse event, which respects normal
    // browser hit-testing/z-order — it hit the backdrop too (proved: AC5c-i's first attempt at
    // this used force and still failed the same way). Calling .click() on the element directly
    // via page.evaluate bypasses hit-testing entirely (no coordinates, no stacking context
    // involved), which is what actually lets StopsPageComponent's own onLangChange handling be
    // checked on its own merits, decoupled from the backdrop.
    await page.locator('tr.stop-row').first().locator('button').click();
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(1);

    await page.evaluate(() =>
      (document.querySelector('.navbar-lang-trigger') as HTMLElement | null)?.click()
    );
    await expect(page.locator('.navbar-lang-menu')).toBeVisible();
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.navbar-lang-item'));
      const target = items.find((el) => el.textContent?.includes('English'));
      (target as HTMLElement | undefined)?.click();
    });

    // Still open — no reload, no navigation.
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(1);
    // A label that is known to differ between th/en should now read the English string.
    await expect(page.locator('label[for="stopProvince"]')).toHaveText('Province');
  });

  test('AC5d — the modal paints with a skeleton before the detail fetch resolves', async ({
    page,
  }) => {
    // Throttle the detail GET so the optimistic-open window is observable. NOTE: getStopDetail
    // hits `${apiUrl}/api/stops/{id}` — NOT under /private (unlike most of this admin API), fixed
    // after the first run of this spec proved the original `**/private/stops/**` pattern never
    // matched and the skeleton assertion failed as a false negative.
    await page.route('**/api/stops/*', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    const firstRow = page.locator('tr.stop-row').first();
    await firstRow.locator('button').click();

    // Immediately (well inside the artificial 1.5s delay): modal exists, skeleton shows.
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(1);
    await expect(page.locator('.admin-modal .admin-skeleton')).toBeVisible();
  });

  test('AC6 — /admin/vehicles did not gain row-click behaviour', async ({ page }) => {
    await page.goto('/admin/vehicles', { waitUntil: 'networkidle' });
    await page.waitForSelector('table.admin-table tbody tr', { timeout: 20_000 });
    const firstRow = page.locator('table.admin-table tbody tr').first();
    await firstRow.locator('td').first().click();
    // No modal should have opened from a bare row click on this untouched page.
    await expect(page.locator('.admin-modal-backdrop')).toHaveCount(0);
  });

  test('AC7 — dark mode: selected-row highlight and modal body are WCAG-legible (measured, not eyeballed)', async ({
    page,
  }) => {
    await page.locator('.admin-topbar-actions button[aria-pressed]').click();
    await expect(page.locator('body')).toHaveClass(/is-dark/);

    const firstRow = page.locator('tr.stop-row').first();
    await firstRow.locator('td').nth(1).click();
    await expect(firstRow).toHaveClass(/is-selected/);
    await page.waitForSelector('#stopProvince', { timeout: 15_000 });

    const contrast = await page.evaluate(() => {
      // WCAG 2.x relative-luminance / contrast-ratio formulas, computed from the ACTUAL
      // rendered colors (getComputedStyle), not read off a design token by name.
      const srgbToLinear = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      const parseRgb = (input: string): [number, number, number, number] => {
        const m = input.match(/rgba?\(([^)]+)\)/);
        if (!m) return [0, 0, 0, 1];
        const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
        return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
      };
      // Flattens a possibly-translucent foreground color onto its background — needed because
      // --accent-soft (the row highlight) is `rgba(..., 0.16)`, and WCAG contrast is only
      // meaningful between two OPAQUE colors.
      const flatten = (rgba: [number, number, number, number], onto: [number, number, number]) => {
        const [r, g, b, a] = rgba;
        return [
          r * a + onto[0] * (1 - a),
          g * a + onto[1] * (1 - a),
          b * a + onto[2] * (1 - a),
        ] as [number, number, number];
      };
      const luminance = ([r, g, b]: [number, number, number]) => {
        const [rl, gl, bl] = [r, g, b].map(srgbToLinear);
        return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      };
      const ratio = (a: [number, number, number], b: [number, number, number]) => {
        const [lA, lB] = [luminance(a), luminance(b)];
        const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
        return (lighter + 0.05) / (darker + 0.05);
      };

      const results: Record<string, unknown> = {};

      // 1) Selected row: text color vs the highlight background, flattened onto the table's
      // actual page background (the highlight itself is translucent).
      const selectedCell = document.querySelector('tr.stop-row.is-selected td');
      const pageBg = getComputedStyle(document.querySelector('.admin-content') ?? document.body)
        .backgroundColor;
      if (selectedCell) {
        const cs = getComputedStyle(selectedCell);
        const textRgb = parseRgb(cs.color).slice(0, 3) as [number, number, number];
        const bgRgba = parseRgb(cs.backgroundColor);
        const pageBgRgb = parseRgb(pageBg).slice(0, 3) as [number, number, number];
        const flatBg = flatten(bgRgba, pageBgRgb);
        results['selectedRow'] = {
          textColor: cs.color,
          backgroundColor: cs.backgroundColor,
          flattenedOntoPageBg: flatBg,
          contrastRatio: Number(ratio(textRgb, flatBg).toFixed(2)),
        };
      }

      // 2) Modal body: a representative label's text vs the modal's own background.
      const modal = document.querySelector('.admin-modal');
      const label = document.querySelector('label[for="stopProvince"]');
      if (modal && label) {
        const modalBg = parseRgb(getComputedStyle(modal).backgroundColor).slice(0, 3) as [
          number,
          number,
          number
        ];
        const labelColor = parseRgb(getComputedStyle(label).color).slice(0, 3) as [
          number,
          number,
          number
        ];
        results['modalBody'] = {
          textColor: getComputedStyle(label).color,
          modalBackground: getComputedStyle(modal).backgroundColor,
          contrastRatio: Number(ratio(labelColor, modalBg).toFixed(2)),
        };
      }

      // 3) The flagged concern: the empty-photo placeholder box, which uses
      // $secondary-lightgrey/$secondary-light-blue OUTSIDE the --admin-* token gate (per the
      // brief) so it may not respond to dark mode. Every seeded local stop already has a photo
      // (measured earlier — 5/5 checked via GET /api/stops/{id}), so no row currently renders
      // this box; probe it INSIDE the live modal instead of mutating real data (photo upload is
      // separately broken on this local lane, so deleting a seeded photo to reach this state
      // would be irreversible here).
      //
      // cloneNode(false), not document.createElement: Angular's default ViewEncapsulation
      // compiles this component's scoped CSS into attribute selectors keyed by a per-component
      // `_ngcontent-*` attribute Angular stamps onto ITS OWN template nodes. A plain
      // createElement'd node carries no such attribute, so the scoped `.stop-photo-preview--empty`
      // rule silently never matches it — confirmed by a first attempt at this probe, which
      // measured backgroundColor as fully transparent (rgba(0,0,0,0), i.e. no rule applied at
      // all) rather than the SCSS's $secondary-lightgrey. Cloning an existing node from THIS
      // component's own template preserves its `_ngcontent-*` attribute, so the clone is subject
      // to the exact same scoped rules the real placeholder would be.
      const templateNode = document.querySelector('.stop-photo-block h5.admin-form-label');
      results['probeMethodOk'] = !!templateNode;
      if (templateNode) {
        const probe = templateNode.cloneNode(false) as HTMLElement;
        probe.className = 'stop-photo-preview stop-photo-preview--empty';
        probe.style.position = 'fixed';
        probe.style.left = '-9999px';
        probe.style.display = 'flex';
        const span = templateNode.cloneNode(false) as HTMLElement;
        span.className = 'admin-muted small';
        span.textContent = 'placeholder probe';
        probe.appendChild(span);
        (modal ?? document.body).appendChild(probe);
        const probeCs = getComputedStyle(probe);
        const probeTextCs = getComputedStyle(span);
        const probeBg = parseRgb(probeCs.backgroundColor).slice(0, 3) as [number, number, number];
        const probeText = parseRgb(probeTextCs.color).slice(0, 3) as [number, number, number];
        results['emptyPhotoPlaceholder'] = {
          backgroundColor: probeCs.backgroundColor,
          borderColor: probeCs.borderColor,
          textColor: probeTextCs.color,
          contrastRatio: Number(ratio(probeText, probeBg).toFixed(2)),
        };
        probe.remove();
      }

      return results;
    });

    console.log('AC7 dark-mode contrast (measured):', JSON.stringify(contrast, null, 2));

    const selected = contrast['selectedRow'] as { contrastRatio: number } | undefined;
    const modalBody = contrast['modalBody'] as { contrastRatio: number } | undefined;
    const placeholder = contrast['emptyPhotoPlaceholder'] as { contrastRatio: number } | undefined;

    // WCAG AA for normal text is 4.5:1. Assert with the actual measured number in the failure
    // message so a future regression names its own ratio instead of a bare true/false.
    expect(selected?.contrastRatio, JSON.stringify(selected)).toBeGreaterThanOrEqual(4.5);
    expect(modalBody?.contrastRatio, JSON.stringify(modalBody)).toBeGreaterThanOrEqual(4.5);

    // The placeholder is REPORTED, not gated — the brief calls this "pre-existing markup moved
    // verbatim... a finding to REPORT, not necessarily a blocker." No pass/fail assertion here on
    // purpose; the measured ratio goes in the QA report instead.
    console.log('AC7 placeholder ratio (report-only, not gated):', placeholder?.contrastRatio);
  });
});
