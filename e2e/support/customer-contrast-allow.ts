/**
 * Known-open contrast debt for the customer shell (OBRS-584).
 *
 * THIS IS A DEBT REGISTER, NOT AN EXEMPTION LIST. Every entry below is a defect
 * that exists on `dev` today, measured on 2026-07-27 by the gate that reads it,
 * with the card that owns the fix. A NEW site that falls below AA still turns
 * the gate red -- which is the whole point: OBRS-575 shipped 2.79:1 past a green
 * CI because nothing measured that surface at all.
 *
 * THE CONTRACT
 *
 *   * The key embeds the measured COLOUR PAIR. A repaint that changes the pair
 *     invalidates the entry, the stale-entry check fires, and somebody looks
 *     again. An entry keyed only on a selector would quietly go on excusing a
 *     different defect than the one it was written for.
 *   * The reason must name a card. `check-brand-fill-contrast.mjs` has carried
 *     the same rule since OBRS-740, and it is what forced 48 customer-palette
 *     entries to be FIXED rather than tolerated.
 *   * An entry that stops matching anything FAILS the gate. A list that rots is
 *     worse than no list, because it reads as a considered decision.
 *
 * HOW THIS LIST WAS ARRIVED AT, since "53 known failures" deserves an argument
 * rather than an assertion:
 *
 * The first run flagged 176 raw sites. That is the OBRS-569 number almost
 * exactly, and the lesson there was that believing a first gate's red straight
 * would have "fixed" seventeen things that were already correct. So every family
 * below was traced to a mechanism before it was written down, and one WAS thrown
 * out: the Google Identity Services button (1.37:1) is a real WCAG miss whose
 * class names are build hashes that would rot this key on their next release. It
 * is excluded in the sweep and counted as a skip, not parked here. See
 * `customer-contrast.ts`.
 *
 * That exclusion used to be justified as "not ours". OBRS-778 measured otherwise:
 * the button's colour comes from a `theme` option OUR code passes to
 * `renderButton()`, and it was hard-coded to the light-mode value. The skip is
 * still correct; the word "ours" in it was not.
 *
 * The remaining 176 collapsed to 53 once the key stopped carrying five levels of
 * ancestor path (the footer alone had been 91 keys for one bug).
 *
 * The three biggest families are one mechanism each, and the mechanisms are the
 * interesting part:
 *
 *   OBRS-767 -- CLOSED, and its thirteen entries are gone from the register.
 *     The dark footer override was WRITTEN and never painted:
 *     `body.is-dark .menu-container .menu-text` is (0,3,1); Angular compiles the
 *     component's own rule to `.menu-container[_ngcontent] .menu-text[_ngcontent]`,
 *     which is (0,4,0) and wins. Confirmed by walking `document.styleSheets` on
 *     the live page. A gate reading the stylesheet sees a dark pair and passes;
 *     only the browser knows who won. That single fact justified this whole card
 *     -- and it generalised: the census that closed it found 36 more declarations
 *     in the same state, so the mechanism now has a gate of its own
 *     (`dark-override-effective.spec.ts`) rather than a paragraph here.
 *
 *   OBRS-768 -- CLOSED for /my-bookings, and its two entries are gone from the
 *     register. That page never entered dark mode, so every entry it had measured
 *     the IDENTICAL colour in both themes -- which is exactly what a contrast
 *     floor cannot see, since a white card with dark ink passes. /e-ticket keeps
 *     its documented paper exemption; the block below carries the measurements.
 *
 *   OBRS-772 -- 1.4.11 control boundaries. Real by the letter of the standard,
 *     and also the Bootstrap/PrimeNG default border. That card has to settle
 *     the policy before anyone repaints twenty controls.
 *
 * ASCII-only source.
 */

export const CONTRAST_ALLOW: Record<string, string> = {
  // -------------------------------------------------------------------------
  // OBRS-767 -- FIXED. Thirteen entries used to sit here: the whole footer at
  // #535968 ($text-softblack, the LIGHT value) on $dk-bg-card, 2.40:1, plus
  // .copyright-text at 2.69:1 on the page background. The dark value was
  // declared for every one of them in dark-theme.scss and had never rendered.
  // The rules now live in footer.component.scss under `:host-context`, which
  // encapsulation cannot outrank. Measured after the move: every footer text
  // run is #9aa3b8, 6.65:1 on the card and 7.46:1 for .copyright-text on the
  // page background.
  // `e2e/tests/dark-override-effective.spec.ts` is the gate that keeps a
  // declaration in dark-theme.scss from going dead silently again.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // OBRS-768 -- FIXED (2026-08-22) for /my-bookings. Two entries used to sit here:
  //
  //   dark|button.filter-pill|boundary-on-#f9f9ff       1.28:1
  //   dark|button.actions-menu-btn|boundary-on-#ffffff  1.35:1
  //
  // Both were BOUNDARY rows and neither was really a boundary defect: the page did
  // not respond to dark mode at all, so the dark sweep was measuring the LIGHT
  // control on the LIGHT page and filing the light number twice. The card's evidence
  // was never a list of failures, it was a list of IDENTITIES -- seventeen of the
  // twenty surfaces AC-1 names returned byte-identical computed values in both
  // themes. A contrast floor cannot express that: white card, dark ink, 4.60:1, pass.
  // The fix is a `:host-context(body.is-dark)` block in
  // my-bookings.component.scss, and these two controls now take $dk-text-muted
  // borders -- 7.46:1 on $dk-bg for the pill, 6.65:1 on $dk-bg-card for the kebab.
  //
  // Their LIGHT twins are still on the register, under OBRS-772 at the same 1.28 and
  // 1.35, and that is the correct place for them: 772 owns the 1.4.11 boundary policy
  // for the whole app. So the pages are asymmetric on purpose until 772 settles.
  //
  // /e-ticket did NOT get this treatment, and the reason is a measurement rather than
  // an omission (owner's call, 2026-08-22). Measured on the same lane the same day:
  // `.ticket-page` already flips #edf9fe -> #0f1117 (dark-theme.scss section 15 works),
  // `.ticket-paper` is white in both themes by a decision recorded in four places
  // (section 15, design-system.md's dark-theme-exempt note, and the OBRS-296 /
  // OBRS-857 comments in that page's own scss and html), and the sweep found ZERO
  // text runs below AA there in either theme. The card's premise about that page was
  // written in July and OBRS-857 reaffirmed the exemption afterwards.
  //
  // Three TEXT rows of this family left earlier, under OBRS-769 and NOT because 768
  // was fixed -- at that point the surface had not moved and only the colour on it
  // had. Recorded because "an OBRS-769 fix closed OBRS-768 rows" reads like scope
  // creep and is the opposite:
  //
  //   dark|span.label|#989ba4-on-#ffffff                  2.78 -> 4.60
  //   dark|div > dt|#989ba4-on-#ffffff                    2.78 -> 4.60
  //   dark|header.my-bookings__header > p|#717581-on-#f9f9ff  4.39 -> 6.68
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // OBRS-769 -- FIXED (2026-07-28), and OBRS-817 was the same defect filed twice
  // (opened from OBRS-811 without checking this register, which already named
  // four of its sites). Six entries used to sit here:
  //
  //   light|span.label|#989ba4-on-#ffffff                     2.78 -> 4.60
  //   light|div > dt|#989ba4-on-#ffffff                       2.78 -> 4.60
  //   light|span.small|#989ba4-on-#ffffff                     2.78 -> 4.60
  //   light|span.recent-routes-title|#989ba4-on-#ffffff       2.78 -> 4.60
  //   light|span.placeholder-text...|#717581-on-#edf9fe       4.29 -> 6.53
  //   light|header.my-bookings__header > p|#717581-on-#f9f9ff 4.39 -> 6.68
  //
  // TWO tokens, TWO opposite verdicts, and the census is what separated them --
  // `obrs-769-census.spec.ts`, which reuses MEASURE to report every
  // sighting of a hex rather than only the failing ones:
  //
  //   * $text-lightgrey #989ba4 was DELETED. All 44 of its declarations were
  //     foregrounds, and it rendered on exactly two backgrounds in the whole
  //     shell: #ffffff (39 sightings, 2.78:1) and $dk-bg-soft #22263a (one,
  //     5.38:1). No value fixes both -- 4.5:1 on white caps luminance at 0.183
  //     and 4.5:1 on #22263a floors it at 0.266 -- and no value can be a tier
  //     ABOVE $text-lightblack either, since that token clears AA by 0.10. A
  //     fourth muted grey was never legible and could not be made legible.
  //   * $text-lightblack #717581 was KEPT, and its two sub-AA sites repointed to
  //     $text-softblack. 25 other measured sites sit on white at 4.60:1; moving
  //     the token for two would be the trade OBRS-752 refused, in reverse.
  //
  // The one #989ba4 site that was legible (`.recent-routes-title` on the dark
  // booking card) got a `:host-context` dark rule rather than the repoint, which
  // is why the entry for it is gone from BOTH themes rather than swapped.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // OBRS-771 -- FIXED. Seven entries used to sit here, and they were TWO
  // different failures that happened to land on the same card:
  //
  //   * /login and /register: light-mode text on the dark auth card, 1.51:1 and
  //     2.78:1. The dark values were declared in dark-theme.scss section 5 the
  //     whole time and lost the cascade -- the OBRS-767 mechanism again, so the
  //     fix was to MOVE the rules, not to add a colour. See
  //     `e2e/support/dark-override-allow.ts`, which this emptied.
  //   * /passenger-info: 1.09:1 and 1.20:1, and these were CREATED by dark mode
  //     rather than missed by it. Section 14 lifts every text node inside
  //     `.card-container` to $dk-text `!important`; the badge and the two chips
  //     kept the light fills they were designed for, so the theming turned dark
  //     ink on a pale pill into pale ink on a pale pill. Fixed at the SURFACE
  //     (each component's own `:host-context(body.is-dark)`), because repainting
  //     the text dark again would only fail against the card behind it.
  //
  // Measured after the fix, on the real pages with getComputedStyle:
  // welcome-text 1.51 -> 13.98, register-link 1.51 -> 6.65, its link 2.78 ->
  // 8.29, passenget-badge 1.09 -> 12.41, chip name/seat 1.09 -> 12.41, summary
  // chip 1.20 -> 12.41. Light mode is byte-for-byte the same value at all seven.
  //
  // MUTATION-TESTED, because deleting seven rows is also what quietly narrowing
  // a gate looks like. Renaming the moved selectors back out of force turns this
  // gate red on exactly those sites, with exactly those numbers -- 1.51:1 for
  // the login text, 1.09/1.09/1.20 for the chips. The gate is the guard.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // OBRS-563 -- CLOSED by OBRS-811 (2026-07-28). The three dark rows that lived
  // here are gone, not narrowed:
  //
  //   dark|div.value-text|#353c44-on-#22263a                 1.34 -> 12.41
  //   dark|span.current|#353c44-on-#22263a                   1.34 -> 12.41
  //   dark|div.current-passenger > span|#353c44-on-#22263a   1.34 -> 12.41
  //
  // The fix is a `:host-context(body.is-dark)` block in each of the three
  // components that share this recipe (dropdown-group-obrs, dropdown-obrs,
  // dropdown-obrs-passenger) -- it could not go in dark-theme.scss, which is
  // OBRS-767's rule. Light mode is byte-identical at all three: measured
  // before/after in both themes, `.claude/agent-office/scripts/captures/obrs-811`.
  // The stale-entry check in this gate is what forced this edit; it fired the
  // moment the fix landed.
  //
  // The LIGHT boundary row below is NOT that defect and is NOT fixed. It is
  // $primary-lightgrey (#dddee1) on white, the app's default control border --
  // the same framework-default question OBRS-772 owns for twenty other
  // controls. Re-attributed to OBRS-772 rather than left pointing at a closed
  // card, because an allow entry naming a card nobody will reopen is exactly
  // the rot the check above exists to catch.
  // -------------------------------------------------------------------------
  'light|button.btn.dropdown-btn.dropdown-toggle|boundary-on-#ffffff':
    '1.35:1 -- OBRS-772 control boundary (was filed under OBRS-563, closed by OBRS-811)',

  // Two keys, ONE defect: the same #dddee1 border on white, on the same control,
  // under two tag names. OBRS-1224 made the STATION pickers a typeable
  // `<input role="combobox">` (the search box had to become the field), while every
  // other dropdown-group-obrs / dropdown-obrs call site is still a `<button>` --
  // which is why the row above still hits and this one appeared beside it rather
  // than replacing it. Nothing about the colour changed, so this stays OBRS-772's
  // twenty-control policy question and is not a debt this card created.
  // Measured on this run: 1.35:1, x4 sightings across /home and /schedule-booking.
  'light|input.btn.dropdown-btn.dropdown-toggle|boundary-on-#ffffff':
    '1.35:1 -- OBRS-772 control boundary, combobox half of the row above (OBRS-1224)',

  // -------------------------------------------------------------------------
  // OBRS-772 -- WCAG 1.4.11 control boundaries below 3:1.
  //
  // Every one of these is a real miss against the letter of 1.4.11, and every
  // one is also a framework default (Bootstrap `#dee2e6`, the app's own
  // $primary-lightgrey `#dddee1`). Twenty controls is not a bug list, it is a
  // policy question -- does a faint border on a button with a legible label
  // count as "visual information required to identify the component"? OBRS-772
  // has to answer that IN WRITING before anyone repaints twenty controls, and
  // it is explicitly forbidden from closing by quietly narrowing the gate.
  // -------------------------------------------------------------------------
  'light|input.form-control.mt-1|boundary-on-#ffffff': '1.35:1 -- OBRS-772 form field boundary',
  'dark|input.form-control.mt-1|boundary-on-#1a1d27': '1.35:1 -- OBRS-772 form field boundary',
  // OBRS-857 put /find-booking into the sweep and its two fields carry no `.mt-1`, so the same
  // defect arrived under a new key. Same mechanism ($primary-lightgrey #dddee1 from
  // styles.scss:72), same measured 1.35:1, same two surfaces -- registered against OBRS-772
  // rather than repainted here, because a page-local border would leave the other nineteen
  // controls untouched and make OBRS-772's twenty look like nineteen.
  'light|input.form-control|boundary-on-#ffffff': '1.35:1 -- OBRS-772 form field boundary (find-booking)',
  'dark|input.form-control|boundary-on-#1a1d27': '1.35:1 -- OBRS-772 form field boundary (find-booking)',
  'light|input.form-check-input|boundary-on-#ffffff': '1.30:1 -- OBRS-772 checkbox/radio boundary',
  // OBRS-915 REKEYED, NOT REPAINTED. PrimeNG 19 adds `p-datepicker-input` to the
  // date field's class list, and the class list is half of this gate's key, so
  // both entries stopped matching on an upgrade that changed no colour. The
  // MEASUREMENTS are unchanged and that is the point: 1.35:1 on #ffffff and
  // 1.36:1 on #22263a are the same numbers OBRS-772 recorded, re-measured after
  // the upgrade, so the debt these two describe is still exactly the debt they
  // were written for. Anything else would have needed a new entry, not a rename.
  //
  // OBRS-917 REKEYED AGAIN, SAME NUMBERS, AND NOW TWO ENTRIES PER THEME.
  // PrimeNG 20 did not change these colours either -- #dddee1 on #ffffff and
  // #383c4e on #22263a still measure 1.35:1 and 1.36:1, which is how we know
  // this is still OBRS-772's debt rather than a new one. What it changed is the
  // class list, twice over: the order flipped (`p-datepicker-input` leads now),
  // and the third class differs by STATE, so one key per theme became two --
  // `p-filled` on `home`, where the field is pre-populated, and `p-inputtext` on
  // `schedule-booking`, where it is empty.
  //
  // The gate proposed deleting the stale pair. That would have been wrong: the
  // borders are unchanged and still under the floor, so deleting retires a live
  // debt and buys silence. Two renames in two consecutive upgrades is the honest
  // signal that keying on a vendor's class list is fragile -- that deserves its
  // own card, not a quiet redesign smuggled into an upgrade.
  'light|input.p-datepicker-input.p-component.p-filled|boundary-on-#ffffff': '1.35:1 -- OBRS-772 p-datepicker field boundary (home, pre-filled)',
  'light|input.p-datepicker-input.p-component.p-inputtext|boundary-on-#ffffff': '1.35:1 -- OBRS-772 p-datepicker field boundary (schedule-booking, empty)',
  'dark|input.p-datepicker-input.p-component.p-filled|boundary-on-#22263a': '1.36:1 -- OBRS-772 p-datepicker field boundary (home, pre-filled)',
  'dark|input.p-datepicker-input.p-component.p-inputtext|boundary-on-#22263a': '1.36:1 -- OBRS-772 p-datepicker field boundary (schedule-booking, empty)',
  'light|button.theme-toggle-btn|boundary-on-#ffffff': '1.36:1 -- OBRS-772 navbar icon button boundary',
  'dark|button.theme-toggle-btn|boundary-on-#1a1d27': '1.60:1 -- OBRS-772 navbar icon button boundary',
  'light|button.navbar-lang-trigger|boundary-on-#ffffff': '1.36:1 -- OBRS-772 navbar language trigger boundary',
  'light|button.actions-menu-btn|boundary-on-#ffffff': '1.35:1 -- OBRS-772 ghost button boundary',
  'light|button.back-btn|boundary-on-#ffffff': '1.35:1 -- OBRS-772 ghost button boundary',
  'dark|button.back-btn|boundary-on-#0f1117': '1.29:1 -- OBRS-772 ghost button boundary',
  'light|button.btn-back|boundary-on-#ffffff': '1.35:1 -- OBRS-772 ghost button boundary',
  'dark|button.btn-back|boundary-on-#0f1117': '1.29:1 -- OBRS-772 ghost button boundary',
  'light|button.btn-change-info|boundary-on-#ffffff': '1.35:1 -- OBRS-772 ghost button boundary',
  'dark|button.btn-change-info|boundary-on-#1a1d27': '1.35:1 -- OBRS-772 ghost button boundary',
  'light|button.filter-pill|boundary-on-#f9f9ff': '1.28:1 -- OBRS-772 filter pill boundary',
  'light|button.tab|boundary-on-#ffffff': '1.15:1 -- OBRS-772 payment tab boundary',
  'dark|button.tab|boundary-on-#1a1d27': '1.35:1 -- OBRS-772 payment tab boundary',

  // OBRS-970 brought /register, /login-mobile and /forget-password into the sweep,
  // and the same 1.4.11 family arrived with them -- on a surface none of the rows
  // above measure. Those three pages render their OWN layout rather than the
  // customer shell, so the field sits on the dark PAGE (#0f1117) with no card
  // between, and the framework default border reads 1.29:1 there instead of the
  // 1.35:1 it reads on #1a1d27. Same defect, same owner, different pair -- which is
  // exactly why this register keys on the colour pair rather than the selector.
  'dark|input.form-control.mt-1|boundary-on-#0f1117':
    '1.29:1 x7 -- OBRS-772 form field boundary on the auth-page background (register, login-mobile, forget-password)',
  'dark|input.form-control|boundary-on-#0f1117':
    "1.29:1 x2 -- OBRS-772 form field boundary, register's two password fields (no .mt-1, inside .password-container)",
  'dark|button.theme-toggle-btn|boundary-on-#0f1117':
    '1.53:1 x3 -- OBRS-772 ghost control boundary: the theme toggle in the language row of the three auth pages, no fill at all',

  // -------------------------------------------------------------------------
  // The five OBRS-773 entries are GONE because they are FIXED, not moved. The
  // $primary-blue customer button family (.btn-search / .select-btn /
  // .payment-btn and their four unmeasured siblings) now carries a $dk-accent
  // ring in dark mode:
  // 7.37:1 / 8.29:1 / 9.31:1 against the three surfaces it lands on, and a ring
  // is not a fill, so it does not dim on hover -- which is what put the
  // select/payment rows here in the first place. Section P of
  // src/styles/dark-theme.scss carries the derivation, and why a ring beat
  // every fill change available.
  // -------------------------------------------------------------------------
};
