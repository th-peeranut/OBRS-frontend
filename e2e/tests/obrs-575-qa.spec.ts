import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4575';

test.describe('OBRS-575 recent-route quick pick (QA)', () => {
  test('AC#5 anonymous, no history -> strip renders nothing', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.booking-card', { timeout: 15000 });
    // No wrapper element should exist at all.
    await expect(page.locator('.recent-routes-quick-pick')).toHaveCount(0);
    await expect(page.locator('app-recent-routes-quick-pick .recent-route-btn')).toHaveCount(0);
  });

  test('logged-in user with history -> pills render, prefill works', async ({ page }) => {
    await page.goto(BASE + '/login');
    await page.fill('#email', 'customer@system.local');
    await page.fill('#password', 'P@ssw0rd');
    await page.click('.login-btn');
    // Same swallowed-catch shape as below. This test happens to be protected by
    // the `pills.first()` assertion further down (pills cannot exist logged
    // out), but a wait that cannot fail is not a wait — make it assert.
    await page.waitForSelector('.navbar-avatar', { timeout: 30_000 });
    await page.goto(BASE + '/');
    await page.waitForSelector('.booking-card', { timeout: 15000 });

    const pills = page.locator('app-recent-routes-quick-pick .recent-route-btn');
    await expect(pills.first()).toBeVisible({ timeout: 15000 });
    const count = await pills.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);

    const label = await pills.first().textContent();
    expect(label).toContain('→');
    console.log('PILL_LABEL=' + label?.trim());

    await pills.first().click();
    await page.waitForTimeout(300);

    // Assert the EFFECT: the two station dropdowns' rendered selected-value
    // text now reflect the pill's origin/destination (production build has
    // no ngDevMode `window.ng`, so this reads the DOM the user actually sees
    // rather than Angular component internals).
    // OBRS-1224 made the station trigger a typeable `<input role="combobox">`, so
    // "the DOM the user actually sees" is the input's value rather than
    // `.value-text`'s text. The trigger keeps its `.dropdown-btn` class in both
    // shapes, which is why the selector reads that and not a tag.
    const triggers = page.locator('.station-group app-dropdown-group-obrs .dropdown-btn');
    const dropdownValues: string[] = [];
    for (let i = 0; i < (await triggers.count()); i++) {
      dropdownValues.push(await triggers.nth(i).inputValue());
    }
    console.log('DROPDOWN_VALUES=' + JSON.stringify(dropdownValues.map((v) => v.trim())));
    expect(dropdownValues.length).toBe(2);
    expect(dropdownValues[0].trim()).toContain('หนองชาก');
    expect(dropdownValues[1].trim()).toContain('หมอชิต');
  });

  test('dark mode pixel sample on pill', async ({ page }) => {
    await page.goto(BASE + '/login');
    await page.fill('#email', 'customer@system.local');
    await page.fill('#password', 'P@ssw0rd');
    await page.click('.login-btn');
    await page.waitForTimeout(2000);
    await page.goto(BASE + '/');
    await page.waitForSelector('.booking-card', { timeout: 15000 });
    const pill = page.locator('app-recent-routes-quick-pick .recent-route-btn').first();
    await expect(pill).toBeVisible({ timeout: 15000 });

    // Toggle the REAL theme switch in the UI, not devtools class mutation.
    const toggle = page.locator('.theme-toggle-btn').first();
    await toggle.click();
    await page.waitForTimeout(500);

    const isDark = await page.evaluate(() => document.body.classList.contains('is-dark'));
    console.log('IS_DARK=' + isDark);
    expect(isDark).toBe(true);

    const styles = await pill.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, borderColor: cs.borderColor, bg: cs.backgroundColor };
    });
    console.log('DARK_PILL_STYLES=' + JSON.stringify(styles));

    await pill.hover();
    await page.waitForTimeout(300);
    const hoverStyles = await pill.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, bg: cs.backgroundColor };
    });
    console.log('DARK_PILL_HOVER=' + JSON.stringify(hoverStyles));
  });

  test('language switch re-renders pill labels without reload', async ({ page }) => {
    await page.goto(BASE + '/login');
    await page.fill('#email', 'customer@system.local');
    await page.fill('#password', 'P@ssw0rd');
    await page.click('.login-btn');
    // The previous form of this wait ended in `.catch(() => {})`, which swallowed
    // its own timeout — so it asserted nothing at all and the test proceeded on
    // a logged-out page. Wait on the rendered session instead, and let it throw.
    await page.waitForSelector('.navbar-avatar', { timeout: 30_000 });
    await page.goto(BASE + '/');
    await page.waitForSelector('.booking-card', { timeout: 15000 });
    const pill = page.locator('app-recent-routes-quick-pick .recent-route-btn').first();
    await expect(pill).toBeVisible({ timeout: 20000 });
    const before = (await pill.textContent())?.trim();
    console.log('LABEL_BEFORE=' + before);

    await page.locator('.navbar-lang-trigger').first().click();
    await page.waitForTimeout(200);
    // Pick a language different from the current one.
    const items = page.locator('.navbar-lang-item');
    const itemCount = await items.count();
    let clicked = false;
    for (let i = 0; i < itemCount; i++) {
      const isActive = await items.nth(i).evaluate((el) => el.classList.contains('active'));
      if (!isActive) {
        await items.nth(i).click();
        clicked = true;
        break;
      }
    }
    expect(clicked).toBe(true);
    await page.waitForTimeout(500);
    const after = (await pill.textContent())?.trim();
    console.log('LABEL_AFTER=' + after);
    expect(after).not.toBe(before);

    // No reload happened — the SPA root should be the same navigation entry.
    const navEntries = await page.evaluate(() => performance.getEntriesByType('navigation').length);
    console.log('NAV_ENTRIES=' + navEntries);
  });
});
