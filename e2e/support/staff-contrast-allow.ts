/**
 * Known-open contrast debt for the staff shell (OBRS-812).
 *
 * Same contract as `customer-contrast-allow.ts`, which should be read first: this
 * is a DEBT REGISTER, not an exemption list. Every entry below was measured on
 * 2026-09-05 by the gate that reads it, on `origin/dev` at 5950c448, and names
 * the card that owns the fix. A NEW site below AA still turns the gate red.
 *
 * WHY THIS IS A SECOND REGISTER AND NOT MORE ROWS IN `CONTRAST_ALLOW`
 * (OBRS-812 AC-5, and the answer is forced rather than chosen)
 *
 * The OBRS-1435 verdict is computed PER RUN, against the set of identities that
 * run actually scored: an allow entry nobody measured is reported as "verdict
 * withheld" and an entry that WAS measured and no longer matches is reported as
 * "delete it". Both are `expect(...).toBe('')`. So a single register read by two
 * separate sweeps fails on the first push: every staff entry is unmeasured from
 * the customer sweep's point of view, and every customer entry is unmeasured from
 * this one's. One register per sweep is what keeps that verdict meaningful.
 *
 * The overlap is small and was measured rather than assumed. Exactly ONE key
 * below also appears in `CONTRAST_ALLOW`:
 *
 *   light|input.p-datepicker-input.p-component.p-inputtext|boundary-on-#ffffff
 *
 * -- the same PrimeNG default border on the same white surface, seen once on a
 * customer page and once on `/staff/schedules`. Two registers means it is written
 * twice; one register would have meant one of the two sweeps could never prove it
 * still exists. Duplication is the cheaper failure.
 *
 * WHY EVERY ENTRY NAMES OBRS-772 AND NOT A NEW CARD
 *
 * OBRS-772 is open, and it is not a customer-side card: it asks for a WRITTEN
 * decision in `docs/design-system.md` about what control boundary this app
 * accepts, having measured the same three mechanisms -- Bootstrap's
 * `.form-control` border, PrimeNG's `p-inputtext` border, and the ghost/secondary
 * button family. What this card adds is population, not a new question:
 * `.admin-field`, `.admin-btn` and `.admin-dropdown-trigger` are the staff shell's
 * spelling of exactly those three, and they wait on exactly that decision. A
 * second card would split one decision across two.
 *
 * NOT ONE OF THESE IS A TEXT OR PLACEHOLDER FINDING. All 28 are invariant B
 * (WCAG 1.4.11, control boundary). The staff shell's text and its `::placeholder`
 * colours clear AA on all four pages in both themes -- including the two OBRS-797
 * fixed, which this sweep now measures at 7.18:1 in dark rather than taking on
 * trust from a probe that CI never ran.
 *
 * ASCII-only source.
 */

export const STAFF_CONTRAST_ALLOW: Record<string, string> = {
  // --- Bootstrap / PrimeNG framework defaults ------------------------------
  // The `#f8f9fa` twin is the same input on the trip browser's shaded filter
  // strip. It is a separate entry because the surface is part of the key, and it
  // has to be: one of them being scored must not vouch for the other.
  'light|input.form-control.form-control-sm|boundary-on-#ffffff': '1.35:1 -- OBRS-772 form field boundary (staff sell)',
  'light|input.form-control.form-control-sm|boundary-on-#f8f9fa': '1.28:1 -- OBRS-772 form field boundary (staff sell, shaded strip)',
  'dark|input.form-control.form-control-sm|boundary-on-#1d2226': '1.61:1 -- OBRS-772 form field boundary (staff sell)',
  'light|input.form-control.form-control-sm.w-auto|boundary-on-#ffffff': '1.35:1 -- OBRS-772 form field boundary (staff schedules)',
  'dark|input.form-control.form-control-sm.w-auto|boundary-on-#1d2226': '1.61:1 -- OBRS-772 form field boundary (staff schedules)',
  'light|input.p-datepicker-input.p-component.p-inputtext|boundary-on-#ffffff': '1.70:1 -- OBRS-772 p-datepicker field boundary (staff sell / schedules)',
  'dark|input.p-datepicker-input.p-component.p-inputtext|boundary-on-#1d2226': '1.36:1 -- OBRS-772 p-datepicker field boundary (staff sell / schedules)',
  'dark|button.btn.btn-outline-primary.btn-sm|boundary-on-#1d2226': '1.61:1 -- OBRS-772 ghost button boundary (staff sell, Add schedule)',

  // --- design-system SS5 `.admin-field` pill --------------------------------
  // The pill's own 1px outline, NOT its placeholder: the OBRS-797 placeholder on
  // these same three inputs measures 7.18:1 in dark and is a pass, which is the
  // regression cover this card exists to give it.
  'light|input.admin-field.boarding-scan-input|boundary-on-#ffffff': '1.61:1 -- OBRS-772 .admin-field boundary (boarding scan box)',
  'dark|input.admin-field.boarding-scan-input|boundary-on-#1d2226': '1.61:1 -- OBRS-772 .admin-field boundary (boarding scan box)',
  'light|input.admin-field.boarding-search-input|boundary-on-#ffffff': '1.61:1 -- OBRS-772 .admin-field boundary (boarding passenger search)',
  'dark|input.admin-field.boarding-search-input|boundary-on-#1d2226': '1.61:1 -- OBRS-772 .admin-field boundary (boarding passenger search)',
  'light|input.admin-field.p-inputnumber-input.p-component|boundary-on-#ffffff': '1.61:1 -- OBRS-772 .admin-field boundary (inspection odometer)',
  'dark|input.admin-field.p-inputnumber-input.p-component|boundary-on-#1d2226': '1.61:1 -- OBRS-772 .admin-field boundary (inspection odometer)',
  'light|textarea.admin-field|boundary-on-#ffffff': '1.61:1 -- OBRS-772 .admin-field boundary (inspection note + general notes)',
  'dark|textarea.admin-field|boundary-on-#1d2226': '1.61:1 -- OBRS-772 .admin-field boundary (inspection note + general notes)',

  // --- design-system SS3/SS4 `.admin-btn` family ----------------------------
  // `.is-active` is its own entry and its own defect: the selected segment of the
  // boarding mode toggle is the WORST boundary this sweep found, 1.18:1, and it
  // is identical in both themes -- so a dark-only repaint would leave it exactly
  // where it is.
  'light|button.admin-btn|boundary-on-#ffffff': '1.29:1 -- OBRS-772 .admin-btn boundary (boarding actions)',
  'dark|button.admin-btn|boundary-on-#1d2226': '1.61:1 -- OBRS-772 .admin-btn boundary (boarding actions)',
  'light|button.admin-btn.admin-btn-small|boundary-on-#ffffff': '1.70:1 -- OBRS-772 .admin-btn boundary (boarding scan mode toggle, unselected)',
  'dark|button.admin-btn.admin-btn-small|boundary-on-#1d2226': '1.61:1 -- OBRS-772 .admin-btn boundary (boarding scan mode toggle, unselected)',
  'light|button.admin-btn.admin-btn-small.is-active|boundary-on-#ffffff': '1.18:1 -- OBRS-772 .admin-btn boundary (boarding scan mode toggle, selected)',
  'dark|button.admin-btn.admin-btn-small.is-active|boundary-on-#1d2226': '1.18:1 -- OBRS-772 .admin-btn boundary (boarding scan mode toggle, selected)',
  'light|button.admin-btn.inspection-verdict-btn.is-ok|boundary-on-#ffffff': '1.29:1 -- OBRS-772 .admin-btn boundary (inspection verdict OK)',
  'dark|button.admin-btn.inspection-verdict-btn.is-ok|boundary-on-#1d2226': '1.61:1 -- OBRS-772 .admin-btn boundary (inspection verdict OK)',
  'light|button.admin-btn.inspection-verdict-btn.is-needs-repair|boundary-on-#ffffff': '1.29:1 -- OBRS-772 .admin-btn boundary (inspection verdict Needs repair)',
  'dark|button.admin-btn.inspection-verdict-btn.is-needs-repair|boundary-on-#1d2226': '1.61:1 -- OBRS-772 .admin-btn boundary (inspection verdict Needs repair)',

  // --- design-system dropdown trigger ---------------------------------------
  'light|button.admin-dropdown-trigger|boundary-on-#ffffff': '1.19:1 -- OBRS-772 .admin-dropdown-trigger boundary (staff schedules / inspection vehicle picker)',
  'dark|button.admin-dropdown-trigger|boundary-on-#1d2226': '2.36:1 -- OBRS-772 .admin-dropdown-trigger boundary (staff schedules / inspection vehicle picker)',
};
