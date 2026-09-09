/**
 * Known-open contrast debt for the staff shell (OBRS-812).
 *
 * Same contract as `customer-contrast-allow.ts`, which should be read first: this
 * is a register of things that were MEASURED, not an exemption list. It now holds
 * two kinds of row and says which each one is: debt that still names the card
 * owning its fix, and boundaries this app has DECIDED to accept
 * (`docs/design-system.md` §2.6, OBRS-772, 2026-09-08). A NEW site below AA
 * still turns the gate red either way, and so does an entry that stops matching.
 *
 * Every entry below was measured by the gate that reads it: the surviving rows on
 * 2026-09-05 (`origin/dev` at 5950c448), the last four on 2026-09-07, and all of
 * them again on 2026-09-08 on `ao/obrs-772-control-boundary`, which is the run
 * that retired seventeen of them.
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
 * The overlap was small and was measured rather than assumed. Exactly ONE key
 * ever appeared in both registers:
 *
 *   light|input.p-datepicker-input.p-component.p-inputtext|boundary-on-#ffffff
 *
 * -- the same PrimeNG default border on the same white surface, seen once on a
 * customer page and once on `/staff/schedules`. It is now fixed and gone from
 * both, and the duplication earned its keep on the way out: each sweep proved
 * the fix on its own pages, which one shared register could never have done.
 *
 * WHAT OBRS-772 DECIDED, AND WHY ROWS SURVIVED IT
 *
 * OBRS-772 asked for a WRITTEN decision about what control boundary this app
 * accepts. It has one now (`docs/design-system.md` §2.6). Applied here it splits
 * the population in two rather than clearing it:
 *
 *   * A control with no visible content of its own -- a field, a dropdown
 *     trigger -- must clear 3:1, because the boundary is the only thing saying a
 *     control is there. Those were repainted; see the block at the top of the
 *     map below for the seventeen that left.
 *   * A control that carries a readable label may keep a faint border. W3C's
 *     Understanding for 1.4.11 exempts it in as many words, and the rows below
 *     are ACCEPTED on that basis rather than left pending.
 *
 * The one clause that is stricter than WCAG on purpose -- a control that paints a
 * FILL must separate that fill at 3:1, label or not -- is why invariant B was NOT
 * narrowed by this card. Narrowing it to "labelled controls are exempt" would
 * have retired OBRS-746's `.btn-search` (fill 2.80:1 behind a legible white
 * label), the only must-catch invariant B has.
 *
 * WHAT THE NUMBER IN AN ENTRY IS (OBRS-1782, and it was wrong before that card)
 *
 * Every ratio below is the ONE the gate scored, and the gate now picks it by
 * clause rather than by size: a control that paints a fill visible AS A SURFACE
 * (1.5:1 or better against its page -- the house rule §2.6 sets, and the reason it
 * needs one) is scored on that FILL, and a passing border may not answer for it;
 * everything else is scored on its BORDER (clauses 1 and 3), or on the faint fill
 * itself when there is no border to hand it to. Read a number here as "the fill"
 * or "the border" depending on which the entry's own reason names -- they are
 * different defects with different fixes.
 *
 * It used to be `Math.max(fillVsPage, borderVsPage)`, which erased that line, and
 * `.btn-search` is where it bit: fill 2.80:1, ring 7.37:1, scored 7.37 and passed
 * every run. NOT the staff tile rows below -- their 1.09:1 fill is under the
 * surface floor, so clause 2 never reached them and `max()` reported the same
 * 1.61:1 the split does. What was wrong THERE was the recorded reason, not the
 * number. The run log now prints `boundary via fill|border`
 * beside both numbers on every row, so an entry can be checked against the clause
 * it claims without re-deriving anything.
 *
 * 15 of the 18 are invariant B (WCAG 1.4.11, control boundary) and name OBRS-772.
 * The other three are TEXT findings (invariant A, 4.5:1) and name OBRS-1760 --
 * pre-existing colours on `/staff/sell` that this sweep only began to render once
 * OBRS-1752 made its fixture select a trip. No `::placeholder` finding: those
 * clear AA on all four pages in both themes -- including the two OBRS-797
 * fixed, which this sweep now measures at 7.18:1 in dark rather than taking on
 * trust from a probe that CI never ran.
 *
 * ASCII-only source.
 */

export const STAFF_CONTRAST_ALLOW: Record<string, string> = {
  // -------------------------------------------------------------------------
  // OBRS-772 -- SEVENTEEN ENTRIES FIXED HERE (2026-09-08), not narrowed away.
  //
  // The card's policy question is answered and written down in
  // `docs/design-system.md` §2.6. The part of the answer that reaches this file:
  // a control with NO visible content of its own -- an empty field, a dropdown
  // trigger -- has nothing but its boundary to say a control is there, so 3:1 is
  // required. That is the standard's own requirement, and it is the group that
  // was repainted.
  //
  // Gone from this register because they now clear the floor, each measured by
  // this gate on the run that deleted it:
  //
  //   input.form-control.form-control-sm         1.35 / 1.28 / 1.61
  //   input.form-control.form-control-sm.w-auto  1.35 / 1.61
  //   input.p-datepicker-input...p-inputtext     1.70 / 1.36
  //   input.admin-field.boarding-scan-input      1.61 / 1.61
  //   input.admin-field.boarding-search-input    1.61 / 1.61
  //   input.admin-field.p-inputnumber-input      1.61 / 1.61
  //   textarea.admin-field                       1.61 / 1.61
  //   button.admin-dropdown-trigger              1.19 / 2.36
  //
  // They took `--control-outline` (#6c757d light, rgba(255,255,255,.42) dark), a
  // token that exists only for control boundaries -- `--admin-outline` also draws
  // card edges and table rules, which 1.4.11 does not reach, so reusing it would
  // have repainted separators nobody asked about.
  //
  // The `#f8f9fa` twin of the first row is gone with it. It was a separate entry
  // because the surface is part of the key and one of them being scored must not
  // vouch for the other; both were re-measured, so both are honestly retired.
  //
  // `.admin-dropdown-trigger` is filed with the FIELDS rather than with the
  // labelled buttons below. It shows a chosen value the way a field does and its
  // boundary is what says where the field ends -- the same call the customer
  // register already makes for `.btn.dropdown-btn.dropdown-toggle`.
  //
  // The OBRS-797 placeholder cover the `.admin-field` rows used to provide is NOT
  // lost with them: invariant C measures those same three inputs at 7.18:1 in
  // dark on every run, and that is the check that was actually doing the work.
  // -------------------------------------------------------------------------

  // --- what 1.4.11 does NOT require, and this app therefore accepts ---------
  // Every entry from here down is a control that carries its own readable label.
  // W3C's Understanding for 1.4.11, under "Boundaries": a border is "not
  // required, as is therefore not subject to non-text contrast requirements"
  // when visible content already identifies the control. These are ACCEPTED
  // under design-system.md §2.6 clause 3, not debt waiting on a decision.
  //
  // They stay registered rather than being excluded in code on purpose: the
  // register is what makes the acceptance visible and re-measurable, and the
  // OBRS-1435 stale check still fails the build if one of them silently changes.
  'dark|button.btn.btn-outline-primary.btn-sm|boundary-on-#1d2226': '1.61:1 -- OBRS-772 accepted: ghost button with a label (staff sell, Add schedule)',

  // --- design-system SS3/SS4 `.admin-btn` family ----------------------------
  // Every one of these renders a translated text label, so §2.6 clause 3 accepts
  // the border. None of them paints a fill that differs from the surface behind
  // it, which is what would have brought clause 2 (fill >= 3:1) into play.
  //
  // `.is-active` was previously filed here as "its own defect", the WORST
  // boundary this sweep found at 1.18:1 in both themes. That reading was wrong
  // and is corrected rather than deleted: the selected segment of the boarding
  // mode toggle does not rest on this boundary at all. It carries three signals
  // (`boarding-list.component.scss:133`) -- an `--accent-soft` fill, an
  // `--accent-text` colour that invariant A scores and that clears AA, and
  // `font-weight: 700`. A state resting on the faint fill ALONE would be a
  // defect under 1.4.11's state clause; this one does not.
  //
  // ⚠ What nothing here proves: invariant B compares a fill to the PAGE, never
  // to a SIBLING's fill, so "selected fill vs unselected fill" is unmeasured by
  // any gate in this repo. See design-system.md §2.6.
  'light|button.admin-btn|boundary-on-#ffffff': '1.29:1 -- OBRS-772 accepted: labelled button (boarding actions)',
  'dark|button.admin-btn|boundary-on-#1d2226': '1.61:1 -- OBRS-772 accepted: labelled button (boarding actions)',
  'light|button.admin-btn.admin-btn-small|boundary-on-#ffffff': '1.70:1 -- OBRS-772 accepted: labelled button (boarding scan mode toggle, unselected)',
  'dark|button.admin-btn.admin-btn-small|boundary-on-#1d2226': '1.61:1 -- OBRS-772 accepted: labelled button (boarding scan mode toggle, unselected)',
  'light|button.admin-btn.admin-btn-small.is-active|boundary-on-#ffffff': '1.18:1 -- OBRS-772 accepted: labelled button, state carried by colour+weight (boarding scan mode toggle, selected)',
  'dark|button.admin-btn.admin-btn-small.is-active|boundary-on-#1d2226': '1.18:1 -- OBRS-772 accepted: labelled button, state carried by colour+weight (boarding scan mode toggle, selected)',
  'light|button.admin-btn.inspection-verdict-btn.is-ok|boundary-on-#ffffff': '1.29:1 -- OBRS-772 accepted: labelled button (inspection verdict OK)',
  'dark|button.admin-btn.inspection-verdict-btn.is-ok|boundary-on-#1d2226': '1.61:1 -- OBRS-772 accepted: labelled button (inspection verdict OK)',
  'light|button.admin-btn.inspection-verdict-btn.is-needs-repair|boundary-on-#ffffff': '1.29:1 -- OBRS-772 accepted: labelled button (inspection verdict Needs repair)',
  'dark|button.admin-btn.inspection-verdict-btn.is-needs-repair|boundary-on-#1d2226': '1.61:1 -- OBRS-772 accepted: labelled button (inspection verdict Needs repair)',

  // --- surfaces the sell page only renders once a trip is selected ----------
  // The same two ratios as the entries above, and for the route header the same
  // mechanism: `.route-group-header` carries Bootstrap's own `border-bottom`
  // utility, which reads `--bs-border-color`.
  //
  // `.ptype-tile` is the ratio WITHOUT the mechanism, and is kept here with its
  // difference written down rather than smoothed over. Its light border is
  // `border: 1px solid #dee2e6` -- a bare literal at
  // `walk-in-center-panel.component.scss:67`, the only one of the eight #dee2e6
  // sites in `src/` that does not read `var(--bs-border-color, #dee2e6)`. It
  // measures 1.30:1 because the literal happens to equal the token's value.
  //
  // §2.6 accepts both rows, so THIS card did not have to touch that line -- both
  // elements carry readable text (a route name, a passenger-type label). The
  // literal is recorded anyway because the trap is still armed for whoever DOES
  // repaint here one day: a token-level change moves the other seven sites and
  // leaves this one exactly where it is. Its dark half already reads
  // `--admin-outline` and needs nothing.
  'light|div.route-group-header.sticky-top.bg-light|boundary-on-#ffffff': '1.30:1 -- OBRS-772 accepted: labelled surface (staff sell, trip-browser route header)',
  'dark|div.route-group-header.sticky-top.bg-light|boundary-on-#1d2226': '1.61:1 -- OBRS-772 accepted: labelled surface (staff sell, trip-browser route header)',
  'light|div.ptype-tile.d-flex.flex-column|boundary-on-#ffffff': '1.30:1 -- OBRS-772 accepted: labelled tile (staff sell, passenger-type tile)',
  'dark|div.ptype-tile.d-flex.flex-column|boundary-on-#1d2226': '1.61:1 -- OBRS-772 accepted: labelled tile, no fill of its own since OBRS-1782 (staff sell, passenger-type tile)',

  // OBRS-1045 adds a second row of tiles directly under `.ptype-tile`, answering the
  // neighbouring question (adult/child) in the same accent language and with the same
  // values, so it is registered on exactly the same footing.
  //
  // Both rows are clause 3 in BOTH themes now, and the number below did not move to get
  // there -- which is worth saying precisely, because the card that opened this (OBRS-1782)
  // was written expecting it to.
  //
  // Until OBRS-1782 the dark halves painted `--admin-surface-soft`, 1.09:1 on the card, and
  // were filed at the 1.61:1 BORDER while the register's reason said "labelled tile" --
  // clause 3's wording for a tile that was painting a surface. The clause split landed, and
  // with it the owner's 1.5:1 floor for when a fill IS a surface: 1.09 is under that floor,
  // so clause 2 never reached these rows and the gate scores them on the border either way.
  // The `Math.max` defect was real and `.btn-search` is where it bites (fill 2.80:1 passing
  // on a 7.37:1 ring); on THESE rows it was the register's wording that was wrong, not the
  // verdict.
  //
  // So dropping the dark fill was the owner's design call, not a fix the gate demanded, and
  // what it buys is that "no fill of its own" is now literally true rather than true by the
  // width of a threshold. Both rows moved together on purpose: they read as one control
  // group and spot-fixing the newer one would have split the pair.
  //
  // Still open and NOT settled here: the ACTIVE tile scores 2.47:1 under this same key.
  // Its state carries an `--accent-soft` fill, the accent border and `font-weight: 600`,
  // but NO colour change -- so unlike 2.6's worked example it has no signal that invariant
  // A scores. Nothing here measures whether that is enough; OBRS-1774's invariant D will.
  //
  // Ratios measured 2026-09-09 (CI run 34308699575); the 1.09:1 fill that is now gone was
  // computed from the dark tokens at `admin-theme.scss:277-279`.
  'light|button.fare-tile.rounded.px-3|boundary-on-#ffffff': '1.30:1 -- OBRS-772 accepted: labelled tile (staff sell, fare-category tile), added by OBRS-1045',
  'dark|button.fare-tile.rounded.px-3|boundary-on-#1d2226': '1.61:1 -- OBRS-772 accepted: labelled tile, no fill of its own since OBRS-1782 (staff sell, fare-category tile), added by OBRS-1045',

  // --- the three TEXT findings, which are NOT OBRS-772 ----------------------
  // Invariant A, WCAG 1.4.3, 4.5:1 for normal-size text. A darker red and a
  // darker active-tab blue are a fix, not a design-system decision, so these
  // name their own card.
  'light|span.badge.bg-danger.bg-opacity-10|#dc3545-on-#f2e2e3': '3.61:1 -- OBRS-1760 danger badge text (staff sell, trip-row reserved count)',
  'dark|span.badge.bg-danger.bg-opacity-10|#dc3545-on-#2f2328': '3.34:1 -- OBRS-1760 danger badge text (staff sell, trip-row reserved count)',
  'light|p-tab.p-ripple.p-tab.p-tab-active|#3b82f6-on-#ffffff': '3.68:1 -- OBRS-1760 active tab label (staff sell, center panel)',
};
