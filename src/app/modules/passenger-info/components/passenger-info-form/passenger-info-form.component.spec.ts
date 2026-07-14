import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';

import { PassengerInfoFormComponent } from './passenger-info-form.component';
import { SharedModule } from '../../../../shared/shared.module';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { PassengerSeatModule } from '../../passenger-seat.module';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { Schedule } from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectPassengerInfo } from '../../../../shared/stores/passenger-info/passenger-info.selector';

describe('PassengerInfoFormComponent', () => {
  let component: PassengerInfoFormComponent;

  beforeEach(() => {
    component = new PassengerInfoFormComponent(
      createStoreStub(),
      createRouterStub(),
      new FormBuilder(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('seat map always visible (Phase 1-A)', () => {
    it('isSelectSeat defaults to true for every new passenger group', () => {
      // insertPassenger goes through createPassengerGroup
      component.insertPassenger(true);
      const group = component.passengerData.at(0);
      expect(group.get('isSelectSeat')?.value).toBeTrue();
    });

    it('isSelectSeat defaults to true for child passengers too', () => {
      component.insertPassenger(false);
      const group = component.passengerData.at(0);
      expect(group.get('isSelectSeat')?.value).toBeTrue();
    });
  });

  describe('per-leg return seats (Phase B)', () => {
    it('passengerSeatReturn defaults to empty for every new passenger group', () => {
      component.insertPassenger(true);
      expect(component.getFormValue(0, 'passengerSeatReturn')).toBe('');
    });

    it('setPassengerSeatReturn sets the return seat without touching the outbound seat', () => {
      component.insertPassenger(true);
      component.setPassengerSeat(0, '3');
      component.setPassengerSeatReturn(0, '7');
      expect(component.getFormValue(0, 'passengerSeat')).toBe('3');
      expect(component.getFormValue(0, 'passengerSeatReturn')).toBe('7');
    });

    it('outbound and return pools are independent — the same label is allowed on each leg', () => {
      component.insertPassenger(true);
      component.setPassengerSeat(0, '5');
      component.setPassengerSeatReturn(0, '5');
      expect(component.getFormValue(0, 'passengerSeat')).toBe('5');
      expect(component.getFormValue(0, 'passengerSeatReturn')).toBe('5');
    });

    it('getTakenSeatsReturn excludes the current passenger and lists the others’ return seats', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);
      component.setPassengerSeatReturn(0, '2');
      component.setPassengerSeatReturn(1, '4');
      expect(component.getTakenSeatsReturn(0)).toEqual(['4']);
      expect(component.getTakenSeatsReturn(1)).toEqual(['2']);
    });

    it('setPassengerSeatReturn refuses a seat already taken by another passenger on the return leg', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);
      component.setPassengerSeatReturn(0, '6');
      component.setPassengerSeatReturn(1, '6');
      expect(component.getFormValue(1, 'passengerSeatReturn')).toBe('');
    });
  });

  describe('fare-category radio (OBRS-296) — FormControl-level sanity check only', () => {
    // NOTE: a bare FormControl.setValue() never coerces types, so this only
    // confirms the control itself is untyped-boolean-friendly — it does NOT
    // exercise the template's [value] binding or the RadioControlValueAccessor,
    // which is the only place the string-coercion bug (value="false" -> string
    // "false" -> truthy -> every child billed as adult) can actually occur.
    // The real lock for that bug is the DOM/CVA-driven describe block below
    // ("fare-category radio (OBRS-296) — real DOM/CVA path").
    it('setValue(false)/setValue(true) round-trip as real booleans, never strings', () => {
      component.insertPassenger(true); // starts adult
      const group = component.passengerData.at(0);

      group.get('isAdult')?.setValue(false);
      expect(group.get('isAdult')?.value).toBe(false);
      expect(typeof group.get('isAdult')?.value).toBe('boolean');

      group.get('isAdult')?.setValue(true);
      expect(group.get('isAdult')?.value).toBe(true);
      expect(typeof group.get('isAdult')?.value).toBe('boolean');
    });
  });

  describe('shared seat map — active passenger + owner map (OBRS-242)', () => {
    it('defaults both leg active indices to the first passenger', () => {
      component.insertPassenger(true);
      expect(component.activeOutboundIndex).toBe(0);
      expect(component.activeReturnIndex).toBe(0);
    });

    it('setActiveOutbound/setActiveReturn switch the active passenger independently per leg', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);

      component.setActiveOutbound(1);
      component.setActiveReturn(0);

      expect(component.activeOutboundIndex).toBe(1);
      expect(component.activeReturnIndex).toBe(0);
    });

    it('setActiveOutbound/setActiveReturn ignore an out-of-range index', () => {
      component.insertPassenger(true);

      component.setActiveOutbound(5);
      component.setActiveReturn(-1);

      expect(component.activeOutboundIndex).toBe(0);
      expect(component.activeReturnIndex).toBe(0);
    });

    it('deletePassenger clamps an active index that falls out of range', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);
      component.setActiveOutbound(1);

      component.deletePassenger(1);

      expect(component.activeOutboundIndex).toBe(0);
    });

    it('getSeatOwners returns every passenger with an assigned outbound seat, keyed by seat label', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);
      component.passengerData.at(0).patchValue({ gender: 'MALE' });
      component.passengerData.at(1).patchValue({ gender: 'FEMALE' });
      component.setPassengerSeat(0, '1');
      component.setPassengerSeat(1, '2');

      expect(component.getSeatOwners()).toEqual({
        '1': { label: '1', gender: 'MALE' },
        '2': { label: '2', gender: 'FEMALE' },
      });
    });

    it('getSeatOwners omits passengers with no assigned seat', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);
      component.setPassengerSeat(0, '1');

      expect(component.getSeatOwners()).toEqual({ '1': { label: '1', gender: '' } });
    });

    it('getSeatOwnersReturn is independent of the outbound owner map', () => {
      component.insertPassenger(true);
      component.setPassengerSeat(0, '1');
      component.setPassengerSeatReturn(0, '9');

      expect(component.getSeatOwners()).toEqual({ '1': { label: '1', gender: '' } });
      expect(component.getSeatOwnersReturn()).toEqual({ '9': { label: '1', gender: '' } });
    });
  });
});

describe('PassengerInfoFormComponent (OPEN-seating rendering, OBRS-323)', () => {
  let fixture: ComponentFixture<PassengerInfoFormComponent>;
  let component: PassengerInfoFormComponent;
  let store: MockStore;

  const openSchedule: Schedule = {
    id: 1,
    vehicleType: 'van',
    departureDateTime: '2030-06-17T08:00:00+07:00',
    arrivalDateTime: '2030-06-17T09:58:00+07:00',
    pricePerSeat: '200',
    availableSeats: 2,
    availableSeatNumbers: ['1A', '2A'],
    seatingMode: 'OPEN',
  };

  const assignedSchedule: Schedule = {
    id: 2,
    vehicleType: 'van',
    departureDateTime: '2030-06-18T08:00:00+07:00',
    arrivalDateTime: '2030-06-18T09:58:00+07:00',
    pricePerSeat: '200',
    availableSeats: 10,
    availableSeatNumbers: ['1A', '2A', '3A'],
    seatingMode: 'ASSIGNED',
  };

  function render(schedule: Schedule[]): void {
    store.overrideSelector(selectScheduleBooking, { schedule });
    store.overrideSelector(selectScheduleFilter, {
      passengerInfo: [
        { type: 'ADULT', count: 1 },
        { type: 'KIDS', count: 0 },
      ],
    } as any);
    store.overrideSelector(selectPassengerInfo, null as any);
    fixture = TestBed.createComponent(PassengerInfoFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PassengerInfoFormComponent],
      imports: [
        ReactiveFormsModule,
        RouterTestingModule,
        TranslateModule.forRoot(),
        PassengerSeatModule,
        DropdownObrsComponent,
      ],
      providers: [provideMockStore()],
    }).compileComponents();
    store = TestBed.inject(MockStore);
  });

  it('one-way OPEN schedule: no seat map renders, and + beyond availableSeats does not grow passengerData', () => {
    render([openSchedule]);

    expect(fixture.debugElement.queryAll(By.css('app-passenger-seat-van')).length).toBe(0);
    expect(fixture.debugElement.queryAll(By.css('app-passenger-seat-bus')).length).toBe(0);
    expect(fixture.debugElement.queryAll(By.css('.open-seat-card')).length).toBe(1);

    // Seeded with 1 adult from the schedule filter; openSchedule.availableSeats = 2.
    expect(component.passengerData.length).toBe(1);

    const addBtn = fixture.debugElement.query(By.css('.passenger-add'));
    addBtn.nativeElement.click();
    fixture.detectChanges();
    expect(component.passengerData.length).toBe(2);

    // At the availableSeats cap (2) now — a further click must not grow it.
    addBtn.nativeElement.click();
    fixture.detectChanges();
    expect(component.passengerData.length).toBe(2);
  });

  it('OPEN near-full (availableSeats <= LOW_SEAT_THRESHOLD): the "เหลือ X ที่นั่ง" remaining-seat line IS shown', () => {
    render([openSchedule]); // availableSeats = 2 (<= 5)
    const card = fixture.debugElement.query(By.css('.open-seat-card')).nativeElement;
    expect(card.textContent).toContain('SCHEDULE_BOOKING.SEAT_REMAIN');
  });

  it('OPEN plenty (availableSeats > LOW_SEAT_THRESHOLD): the remaining-seat line is HIDDEN (no inventory reveal), count card still renders', () => {
    render([{ ...openSchedule, availableSeats: 13 }]); // 13 > 5
    expect(fixture.debugElement.queryAll(By.css('.open-seat-card')).length).toBe(1);
    const card = fixture.debugElement.query(By.css('.open-seat-card')).nativeElement;
    expect(card.textContent).not.toContain('SCHEDULE_BOOKING.SEAT_REMAIN');
  });

  it('mixed-mode round trip: OPEN outbound renders a count card, ASSIGNED return still renders its seat map', () => {
    render([openSchedule, assignedSchedule]);

    // Outbound (OPEN): no seat map, count card present.
    // Return (ASSIGNED, van): exactly one seat map, for the return leg only.
    expect(fixture.debugElement.queryAll(By.css('app-passenger-seat-van')).length).toBe(1);
    expect(fixture.debugElement.queryAll(By.css('.open-seat-card')).length).toBe(1);
  });

  it('ASSIGNED-only schedule (regression): seat map renders as before, no OPEN-seating card', () => {
    render([assignedSchedule]);

    expect(fixture.debugElement.queryAll(By.css('app-passenger-seat-van')).length).toBe(1);
    expect(fixture.debugElement.queryAll(By.css('.open-seat-card')).length).toBe(0);
  });
});

// OBRS-296 (Scrutinize follow-up): the FormControl-level test above is
// vacuous against the actual coercion bug — a bare FormControl never coerces
// on setValue(), so it would still pass even if the template regressed to
// the gender radios' string-attribute form (`value="false"`). This suite
// renders the real template via TestBed and drives the native radio inputs
// through a real click + change event, which is the ONLY path
// RadioControlValueAccessor's string-vs-boolean coercion can occur on. A
// revert to `value="false"`/`value="true"` (string attribute) makes the
// child radio's `value` DOM property become the string "false", so
// RadioControlValueAccessor would write the STRING back to the FormControl —
// failing the `typeof ... === 'boolean'` assertions below.
describe('PassengerInfoFormComponent — fare-category radio (OBRS-296) — real DOM/CVA path', () => {
  let fixture: ComponentFixture<PassengerInfoFormComponent>;
  let component: PassengerInfoFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PassengerInfoFormComponent],
      imports: [SharedModule, DropdownObrsComponent, PassengerSeatModule, TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: createStoreStub() },
        { provide: Router, useValue: createRouterStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PassengerInfoFormComponent);
    component = fixture.componentInstance;
    // The store/schedule-filter streams are stubbed to emit null (see
    // createStoreStub()), so ngOnInit's auto-insert-from-schedule-filter path
    // never fires — insert the one passenger group this suite needs directly,
    // same as the bare-instantiation suite above.
    component.insertPassenger(true); // starts Adult
    fixture.detectChanges();
  });

  function radioEl(id: string): HTMLInputElement {
    const el = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement | null;
    if (!el) {
      throw new Error(`Radio input #${id} not found in the rendered template`);
    }
    return el;
  }

  it('selecting the Child radio through the DOM writes a real boolean false — never the string "false"', () => {
    const childRadio = radioEl('fareCategory_child-0');

    childRadio.click();
    fixture.detectChanges();

    const value = component.passengerData.at(0).get('isAdult')?.value;
    expect(typeof value).toBe('boolean');
    expect(value).toBe(false);
    expect(value as unknown).not.toBe('false');
  });

  it('selecting the Adult radio through the DOM writes a real boolean true — never the string "true"', () => {
    // Start the group as Child so selecting Adult is an observable transition.
    component.passengerData.at(0).get('isAdult')?.setValue(false);
    fixture.detectChanges();

    const adultRadio = radioEl('fareCategory_adult-0');
    adultRadio.click();
    fixture.detectChanges();

    const value = component.passengerData.at(0).get('isAdult')?.value;
    expect(typeof value).toBe('boolean');
    expect(value).toBe(true);
    expect(value as unknown).not.toBe('true');
  });

  it('the rendered radios reflect the boolean isAdult value — Adult checked by default, Child unchecked', () => {
    // insertPassenger(true) in beforeEach starts the group as Adult.
    expect(radioEl('fareCategory_adult-0').checked).toBeTrue();
    expect(radioEl('fareCategory_child-0').checked).toBeFalse();
  });
});
