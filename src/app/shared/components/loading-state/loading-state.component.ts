import { Component, Input } from '@angular/core';

export type LoadingStateVariant = 'skeleton' | 'spinner' | 'inline';
export type LoadingStateGraphic = 'ring' | 'icon';
export type LoadingStateSkeletonShape = 'bar' | 'sm' | 'pill';

/**
 * OBRS-907: the one shared loading indicator, consolidating the app's
 * duplicated shimmer/spinner CSS (14 component stylesheets each hand-rolled
 * their own `.xxx__spinner` + `@keyframes xxx-spin`, and the admin
 * `.admin-skeleton` family lived only inside `admin-theme.scss`).
 *
 * Three variants:
 *  - `skeleton` — shimmer bar(s). Renders the EXISTING global `.admin-skeleton`
 *    primitive (moved, not renamed, to `src/styles/_loading.scss`), so this is
 *    a reuse, not a new look. `rows` controls how many stacked bars render;
 *    `skeletonShape` maps to the existing `--sm` / `--pill` modifiers.
 *  - `spinner` — a medium circular indicator for the middle of a box/panel.
 *  - `inline` — a text-sized spinner for placing inside a button.
 *
 * `spinner` / `inline` render one of two graphics (`graphic` input):
 *  - `'ring'` (default) — a plain CSS border-circle spinner. No canonical
 *    version of this existed before this card; it's the replacement for the
 *    ~12 near-identical hand-rolled ring spinners across customer-shell
 *    dialogs (change-email/close-account/change-seat/change-stop/reschedule/
 *    trip-track/my-bookings/payment-result/ticket-modal/...).
 *  - `'icon'` — reuses the EXISTING global `.admin-loading-spinner` primitive
 *    (a rotating Material Symbol glyph, defined in `admin-theme.scss` and
 *    still used directly by `export-button`) rather than forking a second
 *    icon-spinner look. Intended for admin/staff-shell call sites that
 *    already read `--accent-text`.
 *
 * `sizePx` / `ringWidthPx` / `durationMs` are optional pixel/ms overrides so
 * a migrated call site can reproduce its EXACT prior size/thickness/speed
 * (see `my-booking-ticket-modal.component.html` for the canonical example)
 * instead of the variant's own default — the whole point of a behavior-
 * preserving consolidation is that a call site's visual doesn't move.
 *
 * a11y: the host renders `role="status"` + `aria-live="polite"` with a
 * visually-hidden, translated status message (`messageKey`, default
 * `COMMON.LOADING` — already used elsewhere in the app, no new i18n key
 * needed) as the accessible name; the graphic itself is `aria-hidden="true"`.
 * A VISIBLE caption (e.g. "Loading your ticket…") stays owned by the call
 * site exactly as before — this component only renders the indicator, never
 * a caption, so migrating a site that already showed a visible caption
 * doesn't duplicate or drop it.
 *
 * `prefers-reduced-motion: reduce` stops every animation this component can
 * render without the indicator disappearing — a static ring / static icon /
 * static skeleton bar remains visible. See `loading-state.component.scss`.
 */
@Component({
  selector: 'app-loading-state',
  templateUrl: './loading-state.component.html',
  styleUrl: './loading-state.component.scss',
  // OBRS-915: Angular 19 flipped the DEFAULT of `standalone` from false to
  // true, and `ng update`'s migration wrote `standalone: false` onto every
  // component that was declared in an NgModule at the time it ran. This
  // component landed on `dev` (OBRS-907) after that, so the migration never saw
  // it, and merging `dev` in produced `TS-996008: Component
  // LoadingStateComponent is standalone, and cannot be declared in an NgModule`
  // — the decorator did not change, the default underneath it did.
  //
  // `false`, not a conversion to standalone: this card is the framework
  // upgrade, and SharedModule keeps declaring what it declared. Every component
  // authored against 18 and merged from here on needs this same line until the
  // tree is converted, which is its own card.
  standalone: false,
})
export class LoadingStateComponent {
  @Input() variant: LoadingStateVariant = 'spinner';
  @Input() graphic: LoadingStateGraphic = 'ring';
  // Material Symbols Outlined glyph name, used only when graphic="icon".
  @Input() icon = 'progress_activity';
  // skeleton: number of shimmer bars rendered, stacked with an 8px gap.
  @Input() rows = 3;
  @Input() skeletonShape: LoadingStateSkeletonShape = 'bar';
  @Input() sizePx: number | null = null;
  @Input() ringWidthPx: number | null = null;
  @Input() durationMs: number | null = null;
  @Input() messageKey = 'COMMON.LOADING';

  protected get skeletonRowIndexes(): number[] {
    const count = Math.max(1, this.rows);
    return Array.from({ length: count }, (_, index) => index);
  }
}
