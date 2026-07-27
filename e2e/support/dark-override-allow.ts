/**
 * The debt register for `dark-override-effective.spec.ts` (OBRS-767).
 *
 * Every entry is a declaration in `src/styles/dark-theme.scss` that is known
 * NOT to win, measured, with the card that owns fixing it. It is a register of
 * debt, not a list of exemptions, and the gate holds it to both directions:
 *
 *   * a dead declaration that is NOT in here fails the build -- new debt cannot
 *     be added silently;
 *   * an entry in here that no longer matches a dead declaration ALSO fails the
 *     build -- so the register cannot rot into a lie the way a plain ignore
 *     list does. Fix a rule and you must delete its rows in the same change.
 *
 * The key is `<selector> :: <property>`, taken verbatim from `selectorText` and
 * the CSSOM property name. It deliberately does not include the measured value:
 * a value changes when a token is retuned, and the finding is "this declaration
 * does not apply", which that does not affect. The value lives in the comment
 * so a reader can see what was measured without running anything.
 *
 * MEASURED 2026-07-27 on dev + the OBRS-767 footer fix, over 10 pages: the
 * eight in CUSTOMER_PAGES plus /register and /how-to-book.
 *
 * OBRS-774 CLEARED 31 OF THE 35 ROWS THIS FILE OPENED WITH, AND ONLY TEN OF
 * THEM WERE DEFECTS. Worth knowing before adding a row here, because the
 * register is only ever as honest as the detector that fills it:
 *
 *   * 9 were real -- the login controls, fixed by moving the rules into
 *     login.component.scss under `:host-context(body.is-dark)`. The loudest was
 *     `.login-by-phone-no-btn`, painting #f6fcff: a near-white button in the
 *     middle of the dark auth card, visible to anyone who opened the page.
 *   * 1 was real -- the payment tab strip's inactive-tab colour, which lost a
 *     specificity TIE to section 14's `.card-container *` blanket and was
 *     therefore decided by source order.
 *   * 5 were dead code, deleted rather than made to win (the theme-toggle
 *     block: the component already themed the button correctly and the global
 *     copy asked for DIFFERENT values, so making it win was the regression).
 *   * 16 WERE NOT DEFECTS AT ALL. Eight were `border-width` declarations that
 *     paint exactly the 1px they ask for, mis-normalised because the probe
 *     element had no border-style, so every width in the file read as "wants
 *     0px". Eight were elements owned by a rule's own more-specific variant
 *     (`&.is-active`, `.p-highlight`), where the verdict had been keyed off
 *     whichever element happened to be first in the document. Both causes are
 *     fixed in `dark-override-effective.ts` and both are now gated by the
 *     spec's own must-catch / must-NOT-catch fixtures.
 */
export const DARK_OVERRIDE_ALLOW: Record<string, string> = {
  // ---------------------------------------------------------------------------
  // OBRS-771 owns these four. Note the card states "nobody overrides them",
  // which this census disproves: dark-theme.scss section 5 DOES override them
  // and loses. Same visible defect, different root cause, and it matters --
  // adding a colour where one already exists fixes nothing.
  'body.is-dark .login-container .welcome-text :: color': 'painted #353c44, wants #e8eaf0 -- OBRS-771',
  'body.is-dark .login-container .login-form .register-link :: color': 'painted #353c44, wants #9aa3b8 -- OBRS-771',
  'body.is-dark .login-container .login-form .register-link a :: color': 'painted #3b61a9, wants #4bc2f7 -- OBRS-771',
  'body.is-dark .login-container .hint-text :: color': 'painted #353c44, wants #e8eaf0, /register -- OBRS-771',

  // NOT registered, on purpose: `.p-selectbutton .p-button.p-highlight ::
  // background-color`. The first census flagged it (painted transparent, wants
  // #4bc2f7), and a three-run probe showed why -- PrimeNG settles that fill
  // after first paint, so it reads transparent on some loads and #4bc2f7 on
  // others. It is a measurement artefact, not debt. The gate's two-sample
  // intersection is what keeps it out; if it ever comes back it will come back
  // stably, and then it deserves a row.
};
