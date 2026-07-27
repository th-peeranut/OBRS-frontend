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
 */
export const DARK_OVERRIDE_ALLOW: Record<string, string> = {
  // ---------------------------------------------------------------------------
  // OBRS-774 -- section 2. app-theme-toggle. NOT a visual defect: the component
  // carries its own `:host-context(.is-dark)` and wins, so the button is themed
  // correctly. These five are dead code that ASKS FOR DIFFERENT VALUES than the
  // component uses (border 0.1 vs 0.15, $dk-text-muted vs $dk-text), which is
  // why making them win would be a regression. They should be deleted.
  'body.is-dark app-theme-toggle .theme-toggle-btn :: border-top-color':
    'painted rgba(255,255,255,0.15), wants rgba(255,255,255,0.1) -- OBRS-774, delete',
  'body.is-dark app-theme-toggle .theme-toggle-btn :: border-right-color':
    'painted rgba(255,255,255,0.15), wants rgba(255,255,255,0.1) -- OBRS-774, delete',
  'body.is-dark app-theme-toggle .theme-toggle-btn :: border-bottom-color':
    'painted rgba(255,255,255,0.15), wants rgba(255,255,255,0.1) -- OBRS-774, delete',
  'body.is-dark app-theme-toggle .theme-toggle-btn :: border-left-color':
    'painted rgba(255,255,255,0.15), wants rgba(255,255,255,0.1) -- OBRS-774, delete',
  'body.is-dark app-theme-toggle .theme-toggle-btn :: color':
    'painted #e8eaf0, wants #9aa3b8 -- OBRS-774, delete',

  // ---------------------------------------------------------------------------
  // OBRS-774 -- section 1. Login / register controls.
  'body.is-dark .login-container .login-form .login-btn :: background-color':
    'painted #0772a2, wants #4bc2f7 -- OBRS-774',
  'body.is-dark .login-container .login-form .login-btn :: color':
    'painted #ffffff, wants #0f1117 -- OBRS-774',
  'body.is-dark .login-container .login-form .login-by-phone-no-btn :: background-color':
    'painted #f6fcff -- a near-white fill on the dark card -- wants #22263a -- OBRS-774',
  'body.is-dark .login-container .login-form .login-by-phone-no-btn :: border-top-color':
    'painted #2d7799, wants #4bc2f7 -- OBRS-774',
  'body.is-dark .login-container .login-form .login-by-phone-no-btn :: border-right-color':
    'painted #2d7799, wants #4bc2f7 -- OBRS-774',
  'body.is-dark .login-container .login-form .login-by-phone-no-btn :: border-bottom-color':
    'painted #2d7799, wants #4bc2f7 -- OBRS-774',
  'body.is-dark .login-container .login-form .login-by-phone-no-btn :: border-left-color':
    'painted #2d7799, wants #4bc2f7 -- OBRS-774',
  'body.is-dark .login-container .login-form .login-by-phone-no-btn :: color':
    'painted #0772a2, wants #4bc2f7 -- OBRS-774',
  'body.is-dark .login-container .login-bg :: opacity':
    'painted 0.22, wants 0.08 -- OBRS-774',

  // ---------------------------------------------------------------------------
  // OBRS-771 owns these four. Note the card states "nobody overrides them",
  // which this census disproves: dark-theme.scss section 5 DOES override them
  // and loses. Same visible defect, different root cause, and it matters --
  // adding a colour where one already exists fixes nothing.
  'body.is-dark .login-container .welcome-text :: color': 'painted #353c44, wants #e8eaf0 -- OBRS-771',
  'body.is-dark .login-container .login-form .register-link :: color': 'painted #353c44, wants #9aa3b8 -- OBRS-771',
  'body.is-dark .login-container .login-form .register-link a :: color': 'painted #3b61a9, wants #4bc2f7 -- OBRS-771',
  'body.is-dark .login-container .hint-text :: color': 'painted #353c44, wants #e8eaf0, /register -- OBRS-771',

  // ---------------------------------------------------------------------------
  // OBRS-774 -- section 2. The payment page tab strip, dead as a whole block.
  'body.is-dark .tab:not(.admin-shell .tab) :: color': 'painted #4bc2f7, wants #9aa3b8 -- OBRS-774',
  'body.is-dark .tab:not(.admin-shell .tab) :: background-color':
    'painted rgba(75,194,247,0.16), wants transparent -- OBRS-774',
  'body.is-dark .tab:not(.admin-shell .tab) :: border-top-color':
    'painted #4bc2f7, wants rgba(255,255,255,0.1) -- OBRS-774',
  'body.is-dark .tab:not(.admin-shell .tab) :: border-right-color':
    'painted #4bc2f7, wants rgba(255,255,255,0.1) -- OBRS-774',
  'body.is-dark .tab:not(.admin-shell .tab) :: border-bottom-color':
    'painted #4bc2f7, wants rgba(255,255,255,0.1) -- OBRS-774',
  'body.is-dark .tab:not(.admin-shell .tab) :: border-left-color':
    'painted #4bc2f7, wants rgba(255,255,255,0.1) -- OBRS-774',

  // ---------------------------------------------------------------------------
  // OBRS-774 -- section 3. Booking-flow back buttons keep their light border.
  'body.is-dark .btn-back :: border-top-width': 'painted 1px, wants 0px -- OBRS-774',
  'body.is-dark .btn-back :: border-right-width': 'painted 1px, wants 0px -- OBRS-774',
  'body.is-dark .btn-back :: border-bottom-width': 'painted 1px, wants 0px -- OBRS-774',
  'body.is-dark .btn-back :: border-left-width': 'painted 1px, wants 0px -- OBRS-774',
  'body.is-dark .back-btn :: border-top-width': 'painted 1px, wants 0px -- OBRS-774',
  'body.is-dark .back-btn :: border-right-width': 'painted 1px, wants 0px -- OBRS-774',
  'body.is-dark .back-btn :: border-bottom-width': 'painted 1px, wants 0px -- OBRS-774',
  'body.is-dark .back-btn :: border-left-width': 'painted 1px, wants 0px -- OBRS-774',

  // ---------------------------------------------------------------------------
  // OBRS-774 -- section 4. app-route-map-home over PrimeNG internals.
  'body.is-dark app-route-map-home .p-tabview-nav li .p-tabview-nav-link :: color':
    'painted #4bc2f7, wants #9aa3b8 -- OBRS-774',
  'body.is-dark app-route-map-home .p-tabview-nav li .p-tabview-nav-link :: background-color':
    'painted #22263a, wants transparent -- OBRS-774',
  'body.is-dark app-route-map-home .p-selectbutton .p-button :: color':
    'painted #0f1117, wants #9aa3b8 -- OBRS-774',

  // NOT registered, on purpose: `.p-selectbutton .p-button.p-highlight ::
  // background-color`. The first census flagged it (painted transparent, wants
  // #4bc2f7), and a three-run probe showed why -- PrimeNG settles that fill
  // after first paint, so it reads transparent on some loads and #4bc2f7 on
  // others. It is a measurement artefact, not debt. The gate's two-sample
  // intersection is what keeps it out; if it ever comes back it will come back
  // stably, and then it deserves a row.
};
