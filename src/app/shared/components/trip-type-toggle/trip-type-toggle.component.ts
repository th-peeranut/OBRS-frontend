import { Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { Dropdown } from '../../interfaces/dropdown.interface';

/**
 * OBRS-1025 — trip type (one-way / round-trip) as a visible pill pair.
 *
 * Replaces `app-dropdown-obrs` on the ONE call site where it hid the other
 * option behind a click (`roundTrip`, in `home-booking` and
 * `schedule-booking-filter`). `app-dropdown-obrs` itself is untouched and
 * stays canonical everywhere else — grep-verified call sites: my-report-edit-
 * form, booker-info-form, passenger-info-form, register.
 *
 * Deliberately does NOT reproduce `DropdownObrsComponent.ngOnChanges()`'s
 * "options.find(isDefault) always overwrites the control" behaviour — that is
 * exactly the mechanism OBRS-1185 warned could "fight" the FormControl's own
 * seed (an unconditional overwrite on every `[options]` change would silently
 * re-flip the trip type back to whatever `isDefault` says, even after the
 * user already picked the other one, the moment anything reassigns the
 * `options` array reference). Instead `isDefault` is consulted ONLY inside
 * `writeValue()`, and only when the control hands back no value at all — so
 * the two signals can never disagree: `HomeBookingComponent.createForm()` /
 * `ScheduleBookingFilterComponent.createForm()` always seed a real value
 * (`roundTrip: [2]`), so in practice this component just displays whatever
 * the form already decided; the `isDefault` fallback exists only so a future
 * `roundTrip: [null]` seed (or a `patchValue` that clears the control) still
 * renders a sane default instead of nothing selected.
 *
 * Writes back the SAME shape `app-dropdown-obrs` already did — the full
 * matching `Dropdown` object, not a bare id — so `getPayload()`'s existing
 * `typeof formValue.roundTrip === 'object' ? …id : …` branch and every other
 * `roundTrip`/`isRoundTripReturn` reader in home-booking.component.ts /
 * schedule-booking-filter.component.ts keep reading the identical shape.
 *
 * Purpose-built for trip type, not a generic N-option toggle: the label keys
 * are the existing `HOME.HOME_BOOKING.ROUNDTRIP_1`/`ROUNDTRIP_2` i18n keys
 * (already shipped in all three locales, zero call sites until this card),
 * keyed off `option.id`, rather than the option's own `nameThai`/`nameEnglish`
 * fields (which are plain string literals, not translated through
 * ngx-translate — reusing them here would carry that gap into new code).
 *
 * New pattern (design-system §12): no existing customer-shell precedent for a
 * multi-option segmented toggle. The admin shell's own hand-rolled 2-segment
 * `.admin-btn` toggle (OBRS-312, design-system §12) is not reusable here — it
 * composes `--admin-*` custom properties that only resolve inside
 * `.admin-shell`, and this control renders on the customer home/search pages.
 * Not PrimeNG's `p-selectButton` either — FRONTEND-GOTCHAS: it defaults
 * `allowEmpty: true` (wrong for a control that must always hold exactly one
 * of two values) and its unselected segments have no dark-mode base styling
 * anywhere in this app.
 */
@Component({
  selector: 'app-trip-type-toggle',
  templateUrl: './trip-type-toggle.component.html',
  styleUrl: './trip-type-toggle.component.scss',
  imports: [TranslateModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TripTypeToggleComponent),
      multi: true,
    },
  ],
})
export class TripTypeToggleComponent implements ControlValueAccessor {
  @Input() options: Dropdown[] = [];

  selectedId: number | null = null;

  private onChange: (value: Dropdown) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: Dropdown | number | null | undefined): void {
    const id =
      value && typeof value === 'object' ? (value as Dropdown).id : (value as number | null);

    this.selectedId = id ?? this.getOptions().find((option) => option.isDefault)?.id ?? null;
  }

  registerOnChange(fn: (value: Dropdown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(_isDisabled: boolean): void {}

  get optionList(): Dropdown[] {
    return this.getOptions();
  }

  isSelected(option: Dropdown): boolean {
    return option.id === this.selectedId;
  }

  select(option: Dropdown): void {
    if (this.isSelected(option)) return;

    this.selectedId = option.id;
    this.onChange(option);
    this.onTouched();
  }

  labelKey(option: Dropdown): string {
    return option.id === 1 ? 'HOME.HOME_BOOKING.ROUNDTRIP_1' : 'HOME.HOME_BOOKING.ROUNDTRIP_2';
  }

  private getOptions(): Dropdown[] {
    return Array.isArray(this.options) ? this.options : [];
  }
}
