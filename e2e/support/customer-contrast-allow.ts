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
 *   OBRS-768 -- /my-bookings and /e-ticket never enter dark mode. Every one of
 *     their entries measures the IDENTICAL colour in both themes.
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
  // OBRS-768 -- /my-bookings and /e-ticket do not respond to dark mode at all.
  // Each of these measures the SAME value in light and dark; that identity is
  // the evidence, not an inference. `body.is-dark` is asserted by the sweep, so
  // the theme did apply -- the page's own surfaces just ignore it.
  // -------------------------------------------------------------------------
  // Three of this family's TEXT rows are gone as of OBRS-769, and NOT because
  // OBRS-768 was fixed -- these pages still ignore dark mode, which is why the
  // two boundary rows below are still here. What changed is that the colour they
  // were measuring stopped being sub-AA: repainting a white surface's text for
  // LIGHT mode necessarily repaints it in dark too, on a page whose surface is
  // white in both. The three that left:
  //
  //   dark|span.label|#989ba4-on-#ffffff                  2.78 -> 4.60
  //   dark|div > dt|#989ba4-on-#ffffff                    2.78 -> 4.60
  //   dark|header.my-bookings__header > p|#717581-on-#f9f9ff  4.39 -> 6.68
  //
  // Worth stating plainly, because "an OBRS-769 fix closed OBRS-768 rows" reads
  // like scope creep and is the opposite: 768 owns the SURFACE, and the surface
  // has not moved.
  'dark|button.filter-pill|boundary-on-#f9f9ff': '1.28:1 -- OBRS-768, unthemed surface (boundary debt itself is OBRS-772)',
  'dark|button.actions-menu-btn|boundary-on-#ffffff': '1.35:1 -- OBRS-768, unthemed surface (boundary debt itself is OBRS-772)',

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
  'light|input.form-check-input|boundary-on-#ffffff': '1.30:1 -- OBRS-772 checkbox/radio boundary',
  'light|input.p-inputtext.p-component|boundary-on-#ffffff': '1.35:1 -- OBRS-772 p-datepicker field boundary',
  'dark|input.p-inputtext.p-component|boundary-on-#22263a': '1.36:1 -- OBRS-772 p-datepicker field boundary',
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

  // -------------------------------------------------------------------------
  // OBRS-773 -- the one boundary finding that is NOT a faint border: a filled
  // primary button whose fill sinks into the card it sits on. OBRS-746 measured
  // this and wrote it onto OBRS-584's card; nothing owned the fix until now.
  // Before OBRS-752 the same button failed the OTHER criterion (white label at
  // 2.03:1 on #4bc2f7), so this is the tail of a trade, not a new regression.
  // -------------------------------------------------------------------------
  'dark|button.btn.btn-search|boundary-on-#22263a': '2.80:1 -- OBRS-773 primary fill vs the dark card, no border to carry it',

  // The same family, in a state the rest sweep cannot reach: these two buttons
  // CLEAR 3:1 at rest ($primary-blue #0772a2) and fall below it on hover, when
  // the fill darkens to $primary-blue-hover #065d85. The button loses its
  // boundary at the moment you point at it.
  //
  // Note the tension this creates, because whoever picks OBRS-773 up will hit
  // it: invariant 2 of check-brand-fill-contrast.mjs REQUIRES a hover fill to be
  // darker than its rest fill (OBRS-763, after the OBRS-741 inversion). On a
  // dark page "darker" and "still 3:1 against the page" pull against each other,
  // so the answer is probably a ring rather than a different fill.
  'dark:hover|button.select-btn|boundary-on-#1a1d27': '2.33:1 -- OBRS-773, hover fill sinks into the dark card',
  'dark:focus|button.select-btn|boundary-on-#1a1d27': '2.33:1 -- OBRS-773, focus fill sinks into the dark card',
  'dark:hover|button.payment-btn|boundary-on-#0f1117': '2.62:1 -- OBRS-773, hover fill sinks into the dark page',
  'dark:focus|button.payment-btn|boundary-on-#0f1117': '2.62:1 -- OBRS-773, focus fill sinks into the dark page',
};
