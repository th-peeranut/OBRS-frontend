/**
 * OBRS-642 — repro probe for the global blocking loading overlay on the home page.
 *
 * The card was filed on the *cosmetic* half ("modal covers the search form, gone in
 * ~0.8s"). The 2026-08-10 prod report is the severe half: the same overlay hung for
 * over a minute on a phone, and there is no way out of it but a page refresh.
 *
 * This probe measures three arms against a locally-served build, with every /api/
 * response fulfilled by Playwright so the result does not depend on a backend:
 *
 *   A (positive control) — every /api/ answers fast. The overlay MUST be observed at
 *       least once and MUST reach 0 containers. If arm A never sees an overlay the
 *       probe itself is broken and arm B's "still there" proves nothing (this is the
 *       exact false-negative OBRS-930's repro hit: a dead observer reads as "no bug").
 *   B (the reported bug) — one /api/ request is stalled and never answered. Samples
 *       the overlay over STALL_SECONDS, then tries every escape a real user has:
 *       Escape key, click outside the popup, look for a close button.
 *   C (reachability) — with the overlay up, is the search form actually unreachable?
 *       document.elementFromPoint over the form tells us, rather than eyeballing.
 *
 * Usage:
 *   node e2e/probe-obrs-642-loading-overlay.mjs
 *   BASE_URL=http://127.0.0.1:4282 STALL_SECONDS=65 OUT_DIR=... node e2e/...
 */
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4282';
const OUT = process.env.OUT_DIR || path.resolve('obrs-642-evidence');
const STALL_SECONDS = Number(process.env.STALL_SECONDS || 65);
const LABEL = process.env.LABEL || 'BEFORE';

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Everything the DOM can tell us about the overlay, in one round-trip. */
const overlayState = (page) =>
  page.evaluate(() => {
    const containers = document.querySelectorAll('.swal2-container');
    const popup = document.querySelector('.swal2-popup');
    const cs = popup ? getComputedStyle(popup) : null;
    // SweetAlert2 renders close/confirm/cancel into every popup and hides the unused
    // ones with display:none, so `querySelector(...) !== null` says nothing about what
    // the customer can actually press. Measure the computed style, not the node.
    const shown = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    return {
      containers: containers.length,
      popupVisible: !!cs && cs.display !== 'none' && cs.visibility !== 'hidden',
      title: document.querySelector('.swal2-title')?.textContent?.trim() ?? null,
      // The three escapes a real user would reach for — visible, not merely present.
      closeButtonShown: shown('.swal2-close'),
      confirmButtonShown: shown('.swal2-confirm'),
      cancelButtonShown: shown('.swal2-cancel'),
      spinnerShown: shown('.swal2-loader'),
    };
  });

/** Is the thing the customer came here for actually clickable? */
const formReachability = (page) =>
  page.evaluate(() => {
    const probe = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, found: false };
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const inViewport = y >= 0 && y <= window.innerHeight && r.width > 0;
      const hit = inViewport ? document.elementFromPoint(x, y) : null;
      return {
        sel,
        found: true,
        inViewport,
        // covered = the topmost element at the form's own centre belongs to the overlay
        covered: !!hit && !!hit.closest('.swal2-container'),
        topmost: hit ? hit.className?.toString().slice(0, 60) : null,
      };
    };
    return ['app-home-booking form', 'app-home-booking', '.p-select, p-select, select'].map(probe);
  });

async function run() {
  const browser = await chromium.launch();
  const ledger = { base: BASE, label: LABEL, stallSeconds: STALL_SECONDS, arms: {} };

  // ---------------------------------------------------------------- arm A (control)
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'ok', data: [] }),
      })
    );

    const samples = [];
    const stop = (async () => {
      // Poll from before navigation so a fast overlay cannot slip between samples.
      for (let i = 0; i < 200; i++) {
        try {
          samples.push(await overlayState(page));
        } catch {
          /* navigation in flight */
        }
        await sleep(100);
      }
    })();

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await sleep(12_000);
    await stop.catch(() => {});

    const seen = samples.filter((s) => s.containers > 0);
    ledger.arms.A_control = {
      overlayEverSeen: seen.length > 0,
      maxContainers: Math.max(0, ...samples.map((s) => s.containers)),
      finalContainers: samples.at(-1)?.containers ?? null,
      titlesSeen: [...new Set(seen.map((s) => s.title).filter(Boolean))],
      approxVisibleMs: seen.length * 100,
    };
    await ctx.close();
  }

  // ------------------------------------------------------- arm B (stall) + arm C
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();

    let stalledUrl = null;
    // ORDER MATTERS AND IT IS BACKWARDS FROM THE OBVIOUS READING: Playwright runs the
    // LAST-registered matching handler first. Registering the catch-all last made it
    // swallow /api/stops, so the first run of this probe stalled nothing and reported a
    // clean page — a false negative that looked exactly like "no bug". Catch-all FIRST,
    // the specific stall SECOND, and assert `stalledRequest` is non-null before reading
    // anything else in this arm.
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'ok', data: [] }),
      })
    );
    // One endpoint never answers. Not fulfilling and not continuing leaves the
    // request pending for the lifetime of the page — exactly a dead request.
    await page.route('**/api/stops**', (route) => {
      stalledUrl = route.request().url();
      /* intentionally never resolved */
    });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const timeline = [];
    const marks = [5, 15, 30, 45, STALL_SECONDS].filter((m) => m <= STALL_SECONDS);
    let elapsed = 0;
    for (const m of marks) {
      await sleep((m - elapsed) * 1000);
      elapsed = m;
      timeline.push({ atSeconds: m, ...(await overlayState(page)) });
      // Shoot at 15s, while the request is still merely slow. This is the frame that
      // corresponds to the customer's own screenshot, and it is where the fix shows:
      // nothing covering the booking form. Measure reachability in the same frame.
      if (m === 15) {
        ledger.arms.C_reachability = await formReachability(page);
        await page.screenshot({
          path: path.join(OUT, `OBRS-642-${LABEL}-0-home-while-stops-hangs-15s.png`),
        });
      }
    }

    // And again at the end — which after the fix is a DIFFERENT state, because the 30s
    // GET ceiling has fired by then and a DISMISSIBLE error alert is the expected
    // result. Keeping both frames stops the end-state shot from being read as the
    // loading one, which is exactly the confusion the single old screenshot caused.
    await page.screenshot({
      path: path.join(OUT, `OBRS-642-${LABEL}-3-home-after-${STALL_SECONDS}s.png`),
      fullPage: false,
    });

    // --- the escapes a real user has ---
    const escapes = {};
    escapes.before = await overlayState(page);

    await page.keyboard.press('Escape');
    await sleep(700);
    escapes.afterEscapeKey = await overlayState(page);

    // Top-left corner is the overlay backdrop, i.e. "tap outside the box".
    await page.mouse.click(8, 8);
    await sleep(700);
    escapes.afterOutsideClick = await overlayState(page);

    ledger.arms.B_stall = {
      stalledRequest: stalledUrl,
      timeline,
      escapes,
      stillBlockingAtEnd: escapes.afterOutsideClick.containers > 0,
    };

    await ctx.close();
  }

  // ------------------------------------------------------------- arm D (escape hatch)
  // A MUTATION that never answers. POST deliberately gets no client-side timeout (a
  // payment aborted here would still have been charged), so the overlay's own escape
  // hatch is the ONLY thing standing between the customer and a locked page. Login is
  // the public page where a customer can trigger a POST without a session.
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    let stalledPost = null;
    await page.route('**/api/**', (route_) => {
      if (route_.request().method() === 'POST') {
        stalledPost = route_.request().url();
        return; /* never resolved */
      }
      return route_.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'ok', data: [] }),
      });
    });

    const arm = { reachedForm: false, stalledPost: null };
    try {
      await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
      await page.fill('input[formControlName="email"]', 'customer@system.local');
      await page.fill('input[formControlName="password"]', 'P@ssw0rd');
      arm.reachedForm = true;
      await page.click('button[type="submit"].login-btn');

      await sleep(4000);
      arm.at4s = await overlayState(page); // before the escape hatch is due
      await sleep(7000);
      arm.at11s = await overlayState(page); // after it is due
      // The escape hatch itself, before anyone presses it. Without this frame the AFTER
      // evidence only shows the aftermath, which proves nothing about what the customer
      // was offered.
      await page.screenshot({
        path: path.join(OUT, `OBRS-642-${LABEL}-1-mutation-overlay-at-11s.png`),
      });

      // Use the door, exactly as a customer would.
      const closeBtn = page.locator('.swal2-close');
      arm.closeButtonClickable = await closeBtn.isVisible().catch(() => false);
      if (arm.closeButtonClickable) {
        await closeBtn.click();
        await sleep(800);
      }
      arm.afterClosePress = await overlayState(page);
      // NOT `locator.isEditable()`: that reports whether the input is enabled, which it
      // is even while an overlay sits on top of it — it answered `true` on the BEFORE
      // run, where the field was demonstrably unreachable. Ask who actually receives a
      // tap at the field's own centre instead.
      arm.emailFieldReachableAfterClose = await page.evaluate(() => {
        const el = document.querySelector('input[formControlName="email"]');
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.round(r.left + r.width / 2),
          Math.round(r.top + r.height / 2)
        );
        return !!hit && !hit.closest('.swal2-container');
      });
      arm.stalledPost = stalledPost;

      await page.screenshot({
        path: path.join(OUT, `OBRS-642-${LABEL}-2-mutation-overlay-escape-hatch.png`),
      });
    } catch (e) {
      arm.error = String(e).slice(0, 300);
    }
    ledger.arms.D_escapeHatch = arm;
    await ctx.close();
  }

  await browser.close();

  const jsonPath = path.join(OUT, `obrs-642-${LABEL.toLowerCase()}-result.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(ledger, null, 2));
  console.log(JSON.stringify(ledger, null, 2));
  console.log('\nwrote ' + jsonPath);

  // Verdict, so a human does not have to re-derive it from the JSON.
  const a = ledger.arms.A_control;
  const b = ledger.arms.B_stall;
  const d = ledger.arms.D_escapeHatch;

  // POSITIVE CONTROL: arm D, not arm A. Before the fix, arm A seeing the overlay on the
  // home page was the control; after the fix its ABSENCE there is the pass condition
  // (AC1/AC4), so it can no longer double as proof the probe can see an overlay at all.
  // Arm D fires one deliberately, from a mutation the fix does not silence.
  if (!d?.reachedForm || !d?.stalledPost) {
    console.log('\n❌ PROBE INVALID — arm D never reached the login form / stalled a POST.');
    process.exitCode = 2;
    return;
  }
  if (!(d.at4s?.containers > 0)) {
    console.log('\n❌ PROBE INVALID — arm D saw no overlay for a stalled POST; probe is blind.');
    process.exitCode = 2;
    return;
  }
  if (!b.stalledRequest) {
    console.log('\n❌ PROBE INVALID — arm B stalled nothing (no /api/stops was intercepted).');
    process.exitCode = 2;
    return;
  }

  console.log(
    `\nARM A (home, all /api/ fast): overlay seen = ${a.overlayEverSeen}, ` +
      `max ${a.maxContainers} container(s), ~${a.approxVisibleMs} ms visible, ` +
      `ended at ${a.finalContainers}.   [AC4 wants 0 / never seen]`
  );
  // Print the whole timeline, not just the end state. The summary line used to report
  // only "0 containers after Escape + outside-click", which was true and concealed that
  // a dialog had appeared at all — the screenshot is what caught it.
  console.log(`ARM B (home, /api/stops stalled ${STALL_SECONDS}s):   [AC1 wants no overlay]`);
  for (const t of b.timeline) {
    console.log(
      `    t=${String(t.atSeconds).padStart(2)}s  containers=${t.containers}` +
        `  dismissible=${t.confirmButtonShown || t.closeButtonShown}` +
        `  title=${t.title ?? '-'}`
    );
  }
  console.log(
    `    after Escape + outside-click: ${b.escapes.afterOutsideClick.containers} container(s)`
  );
  console.log(
    `ARM D (stalled POST): overlay at 4s = ${d.at4s?.containers}, at 11s close button ` +
      `visible = ${d.at11s?.closeButtonShown}; after pressing it → ` +
      `${d.afterClosePress?.containers} container(s), email field reachable = ${d.emailFieldReachableAfterClose}.`
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
