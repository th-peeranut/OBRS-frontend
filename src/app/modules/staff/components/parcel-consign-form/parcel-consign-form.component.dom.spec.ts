import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { AdminDropdownComponent } from '../../../admin/components/admin-dropdown/admin-dropdown.component';
import { ParcelConsignFormComponent } from './parcel-consign-form.component';
import { ParcelPolicyDto, ParcelPolicyService } from '../../../../services/parcel-policy/parcel-policy.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

/**
 * DOM-level specs for the consign form — the logic-level spec next door
 * instantiates the component directly and never compiles the template, so
 * anything that has to be read off rendered markup is asserted here.
 */
const DEFAULT_POLICY: ParcelPolicyDto = {
  maxWeightKg: 100,
  carryOnFreeSizeMaxInch: 28,
  carryOnFreeAisleMaxPerTrip: 10,
  prohibitedCategories: ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'],
};

async function configureFormTestBed(): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
    // The real dropdown, not a stub: it is the ControlValueAccessor behind
    // scheduleId/pickupStopId/dropoffStopId, so without it the form cannot bind at
    // all (NG01203). It has no dependencies of its own beyond ElementRef.
    declarations: [ParcelConsignFormComponent, AdminDropdownComponent],
    providers: [
      {
        provide: ParcelPolicyService,
        useValue: {
          getParcelPolicy: () =>
            of({ code: 200, message: 'OK', data: DEFAULT_POLICY } as ResponseAPI<ParcelPolicyDto>),
        },
      },
    ],
    schemas: [NO_ERRORS_SCHEMA],
  }).compileComponents();
}

/**
 * Renders the carry-on on-seat block for real, so the OBRS-615 guard is
 * asserted against the DOM rather than against a component flag.
 *
 * OBRS-615: an OPEN-seating trip has no seat list to offer and the server rejects a
 * named seat there (PARCEL_SEAT_NUMBERS_NOT_ALLOWED_OPEN), so the whole "specify
 * seats" opt-in is hidden. Both directions are asserted on purpose — a guard
 * hardcoded to true, or to false, would pass either one of them alone.
 */
describe('ParcelConsignFormComponent (OBRS-615 open-seating guard — DOM)', () => {
  let fixture: ComponentFixture<ParcelConsignFormComponent>;

  beforeEach(async () => {
    await configureFormTestBed();
    fixture = TestBed.createComponent(ParcelConsignFormComponent);
  });

  /** Carry-on mode with an over-size item (largest dimension > 28in) — the only
   * state in which the seat block renders at all (`isOnSeat`). */
  function renderOnSeat(availableSeatNumbers: string[]): void {
    const component = fixture.componentInstance;
    component.mode = 'carry_on_seat';
    component.availableSeatNumbers = availableSeatNumbers;
    fixture.detectChanges();
    component['form'].get('dimensions')?.patchValue({ lengthCm: 80, widthCm: 40, heightCm: 30 });
    fixture.detectChanges();
  }

  function specifySeatsCheckbox(): HTMLInputElement | null {
    return fixture.debugElement.query(By.css('#specifySeats'))?.nativeElement ?? null;
  }

  /** The neighbouring field inside the same `@if (isOnSeat)` block — proves the block
   * rendered, so "no checkbox" cannot pass for the wrong reason. */
  function seatCountInput(): HTMLInputElement | null {
    return fixture.debugElement.query(By.css('input[formControlName="seatCount"]'))?.nativeElement ?? null;
  }

  it('offers the specify-seats checkbox on an ASSIGNED trip (there is a seat list to pick from)', () => {
    renderOnSeat(['A1', 'A2']);

    expect(seatCountInput()).not.toBeNull();
    expect(specifySeatsCheckbox()).not.toBeNull();
  });

  it('hides the specify-seats checkbox on an OPEN-seating trip (empty seat list)', () => {
    renderOnSeat([]);

    expect(seatCountInput()).not.toBeNull();
    expect(specifySeatsCheckbox()).toBeNull();
  });
});

/**
 * OBRS-1598 — the page swaps in a new day's `scheduleOptions` when the date
 * changes. `app-admin-dropdown` resolves its label by looking the CURRENT value
 * up in `options`, so a stale round silently renders as the placeholder while
 * `scheduleId` still holds it: the salesperson reads "no round chosen", the form
 * stays valid, and submit sends the previous day's trip. Asserted on the
 * FormControl and the submit button, never on the placeholder alone — a
 * placeholder-only assertion passes on the broken build (OBRS-1063 AC#6).
 */
describe('ParcelConsignFormComponent (OBRS-1598 schedule reset on a date change — DOM)', () => {
  let fixture: ComponentFixture<ParcelConsignFormComponent>;

  const DAY_A = [{ value: '9001', label: 'Bangkok - Chiang Mai · 08:00 · bus' }];
  const DAY_B = [{ value: '9101', label: 'Bangkok - Chiang Mai · 07:30 · bus' }];

  beforeEach(async () => {
    await configureFormTestBed();
    fixture = TestBed.createComponent(ParcelConsignFormComponent);
  });

  /** Every consigned-mode required field filled, with DAY_A's round chosen. */
  function fillValidConsignedForm(): void {
    fixture.componentInstance['form'].patchValue({
      senderName: 'ผู้ส่ง ทดสอบ',
      senderPhone: '0812345678',
      recipientName: 'ผู้รับ ทดสอบ',
      recipientPhone: '0898765432',
      scheduleId: '9001',
      pickupStopId: '1',
      dropoffStopId: '2',
      weightKg: 5,
      description: 'กล่องพัสดุ',
      prohibitedAcknowledged: true,
    });
  }

  function submitButton(): HTMLButtonElement {
    return fixture.debugElement.query(By.css('button[type="submit"]')).nativeElement;
  }

  function scheduleTriggerText(): string {
    return fixture.debugElement
      .query(By.css('app-admin-dropdown[formControlName="scheduleId"] .admin-dropdown-trigger'))
      .nativeElement.textContent.trim();
  }

  it("clears scheduleId and disables submit when the page drops the old day's round", () => {
    fixture.componentInstance.scheduleOptions = DAY_A;
    fixture.detectChanges();
    fillValidConsignedForm();
    fixture.detectChanges();
    expect(submitButton().disabled).toBeFalse();

    // What the page does on a date change: clear, then swap the options.
    fixture.componentInstance.clearScheduleSelection();
    fixture.componentInstance.scheduleOptions = DAY_B;
    fixture.detectChanges();

    expect(fixture.componentInstance['form'].get('scheduleId')?.value).toBe('');
    expect(submitButton().disabled).toBeTrue();
  });

  // AC#2 covers BOTH branches. `applyModeValidators()` never touches
  // `scheduleId` — it stays Validators.required in carry-on too — so the same
  // clear must disable the same button here; a future per-mode validator edit
  // that dropped it would go unnoticed without this.
  it('disables submit in carry-on mode too (free-aisle item, no seat count needed)', () => {
    fixture.componentInstance.mode = 'carry_on_seat';
    fixture.componentInstance.scheduleOptions = DAY_A;
    fixture.detectChanges();
    fillValidConsignedForm();
    fixture.componentInstance['form']
      .get('dimensions')
      ?.patchValue({ lengthCm: 20, widthCm: 20, heightCm: 20 });
    fixture.detectChanges();
    expect(submitButton().disabled).toBeFalse();

    fixture.componentInstance.clearScheduleSelection();
    fixture.componentInstance.scheduleOptions = DAY_B;
    fixture.detectChanges();

    expect(fixture.componentInstance['form'].get('scheduleId')?.value).toBe('');
    expect(submitButton().disabled).toBeTrue();
  });

  it('emits the cleared value so the page can drop the stops/quote/cargo it fed', () => {
    fixture.componentInstance.scheduleOptions = DAY_A;
    fixture.detectChanges();
    fillValidConsignedForm();
    const emitted: string[] = [];
    fixture.componentInstance.scheduleChange.subscribe((v) => emitted.push(v));

    fixture.componentInstance.clearScheduleSelection();

    expect(emitted).toEqual(['']);
  });

  // The measurement the card asked for before its AC could be written: this
  // dropdown does NOT hold the old label, it falls back to the placeholder —
  // so the stale selection is invisible, not merely mislabelled. Untranslated
  // in the test bed, so the placeholder renders as its own i18n key.
  it('renders the placeholder — not the old label — while a stale id is still held', () => {
    fixture.componentInstance.scheduleOptions = DAY_A;
    fixture.detectChanges();
    fillValidConsignedForm();
    fixture.detectChanges();
    expect(scheduleTriggerText()).toContain('Bangkok - Chiang Mai · 08:00 · bus');

    fixture.componentInstance.scheduleOptions = DAY_B;
    fixture.detectChanges();

    expect(scheduleTriggerText()).toContain('STAFF.PARCEL_CONSIGN.FIELD.SCHEDULE');
    expect(fixture.componentInstance['form'].get('scheduleId')?.value).toBe('9001');
  });
});
