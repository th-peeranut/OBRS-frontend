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
 * Renders the carry-on on-seat block for real (the logic-level spec next door
 * instantiates the component directly and never compiles the template), so the
 * OBRS-615 guard is asserted against the DOM rather than against a component flag.
 *
 * OBRS-615: an OPEN-seating trip has no seat list to offer and the server rejects a
 * named seat there (PARCEL_SEAT_NUMBERS_NOT_ALLOWED_OPEN), so the whole "specify
 * seats" opt-in is hidden. Both directions are asserted on purpose — a guard
 * hardcoded to true, or to false, would pass either one of them alone.
 */
const DEFAULT_POLICY: ParcelPolicyDto = {
  maxWeightKg: 100,
  carryOnFreeSizeMaxInch: 28,
  carryOnFreeAisleMaxPerTrip: 10,
  prohibitedCategories: ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'],
};

describe('ParcelConsignFormComponent (OBRS-615 open-seating guard — DOM)', () => {
  let fixture: ComponentFixture<ParcelConsignFormComponent>;

  beforeEach(async () => {
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
