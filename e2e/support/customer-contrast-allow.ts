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
  'dark|span.label|#989ba4-on-#ffffff': '2.78:1 -- OBRS-768, the booking card is still white in dark mode',
  'dark|div > dt|#989ba4-on-#ffffff': '2.78:1 -- OBRS-768, the booking card is still white in dark mode',
  'dark|header.my-bookings__header > p|#717581-on-#f9f9ff': '4.39:1 -- OBRS-768, the page section is still light in dark mode',
  'dark|button.filter-pill|boundary-on-#f9f9ff': '1.28:1 -- OBRS-768, unthemed surface (boundary debt itself is OBRS-772)',
  'dark|button.actions-menu-btn|boundary-on-#ffffff': '1.35:1 -- OBRS-768, unthemed surface (boundary debt itself is OBRS-772)',

  // -------------------------------------------------------------------------
  // OBRS-769 -- the muted text tokens are below AA on the surfaces they are
  // actually used on. $text-lightgrey #989ba4 is 2.78:1 on white; $text-lightblack
  // #717581 clears 4.5 on white (4.60) and misses it on the two tints.
  // Invisible to check-brand-fill-contrast.mjs by construction: these elements
  // inherit their background from an ancestor, so `color` and `background` are
  // never in the same rule block.
  // -------------------------------------------------------------------------
  'light|span.label|#989ba4-on-#ffffff': '2.78:1 -- OBRS-769 $text-lightgrey on white',
  'light|div > dt|#989ba4-on-#ffffff': '2.78:1 -- OBRS-769 $text-lightgrey on white',
  'light|span.small|#989ba4-on-#ffffff': '2.78:1 -- OBRS-769 $text-lightgrey on white',
  // The caption above the recent-route strip -- OBRS-575's own component, and
  // the same token. Its DARK twin passes (#989ba4 on $dk-bg-soft is 4.9:1), so
  // this is a light-mode palette defect, not a theming one.
  'light|span.recent-routes-title|#989ba4-on-#ffffff': '2.78:1 -- OBRS-769 $text-lightgrey on white',
  'light|span.placeholder-text.small.text-center|#717581-on-#edf9fe': '4.29:1 -- OBRS-769 $text-lightblack on $secondary-lightgrey',
  'light|header.my-bookings__header > p|#717581-on-#f9f9ff': '4.39:1 -- OBRS-769 $text-lightblack on $secondary-grey',

  // -------------------------------------------------------------------------
  // OBRS-771 -- two different dark-mode failures on /login and /passenger-info.
  //
  //   * light-mode text with no override at all ($text-black on the dark card);
  //   * text LIFTED to $dk-text over a badge whose light fill was left behind --
  //     1.09:1, pale on pale. Overriding the colour alone created this one.
  // -------------------------------------------------------------------------
  'dark|div.welcome-text.mt-2|#353c44-on-#1a1d27': '1.51:1 -- OBRS-771 light-mode text survives into dark',
  'dark|p.register-link.mt-2|#353c44-on-#1a1d27': '1.51:1 -- OBRS-771 light-mode text survives into dark',
  'dark|a.obrs-link|#3b61a9-on-#1a1d27': '2.78:1 -- OBRS-771 $secondary-blue link on the dark card',
  'dark|div.passenget-badge|#e8eaf0-on-#d9e1f1': '1.09:1 -- OBRS-771 dark text lifted onto an unthemed light badge',
  'dark|span.seat-passenger-chip-name|#e8eaf0-on-#d9e1f1': '1.09:1 -- OBRS-771 dark text lifted onto an unthemed light chip',
  'dark|span.seat-passenger-chip-seat|#e8eaf0-on-#d9e1f1': '1.09:1 -- OBRS-771 dark text lifted onto an unthemed light chip',
  'dark|span.seat-passenger-chip|#e8eaf0-on-#ffffff': '1.20:1 -- OBRS-771 dark text lifted onto a white summary chip',

  // -------------------------------------------------------------------------
  // OBRS-563 -- DropdownGroupObrsComponent has zero dark-mode coverage. That
  // card predates this gate (opened 2026-07-20 from an OBRS-562 scrutinize) and
  // already names the whole panel; these are its sites, now with numbers.
  // -------------------------------------------------------------------------
  'dark|div.value-text|#353c44-on-#22263a': '1.34:1 -- OBRS-563 public dropdown has no dark coverage',
  'dark|span.current|#353c44-on-#22263a': '1.34:1 -- OBRS-563 public dropdown has no dark coverage',
  'dark|div.current-passenger > span|#353c44-on-#22263a': '1.34:1 -- OBRS-563 public dropdown has no dark coverage',
  'light|button.btn.dropdown-btn.dropdown-toggle|boundary-on-#ffffff': '1.35:1 -- OBRS-563 dropdown trigger boundary',

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
  'light|input.p-inputtext.p-component|boundary-on-#ffffff': '1.35:1 -- OBRS-772 p-calendar field boundary',
  'dark|input.p-inputtext.p-component|boundary-on-#22263a': '1.36:1 -- OBRS-772 p-calendar field boundary',
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
