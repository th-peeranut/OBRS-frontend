import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SelectButtonModule } from 'primeng/selectbutton';
import { of } from 'rxjs';

import { PassengerInfoFormComponent } from './passenger-info-form.component';
import { SharedModule } from '../../../../shared/shared.module';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { PassengerSeatModule } from '../../passenger-seat.module';
import {
  createAnalyticsServiceStub,
  createRouterStub,
  createScheduleServiceStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { Schedule } from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectPassengerInfo } from '../../../../shared/stores/passenger-info/passenger-info.selector';
import { invokeSetPassengerInfo } from '../../../../shared/stores/passenger-info/passenger-info.action';
import { ScheduleService } from '../../../../services/schedule/schedule.service';
import { PassengerInfoComponent } from '../../passenger-info.component';

describe('PassengerInfoFormComponent', () => {
  let component: PassengerInfoFormComponent;

  beforeEach(() => {
    component = new PassengerInfoFormComponent(
      createStoreStub(),
      createRouterStub(),
      new FormBuilder(),
      createTranslateStub(),
      createScheduleServiceStub()
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

  // OBRS-361: showSeatPreferenceFields() full enumeration table from the UX
  // spec. Hide iff (a) every leg is OPEN, or (b) every ASSIGNED leg relevant
  // to this passenger already has a seat. A one-way booking never looks at
  // passengerSeatReturn; a mixed round trip never requires the OPEN leg's
  // (always-empty) seat.
  describe('showSeatPreferenceFields (OBRS-361) — leg-aware visibility enumeration', () => {
    beforeEach(() => {
      component.insertPassenger(true);
    });

    it('one-way, ASSIGNED, no seat picked -> SHOWN', () => {
      expect(component.showSeatPreferenceFields(0, false, false, false)).toBeTrue();
    });

    it('one-way, ASSIGNED, seat picked -> HIDDEN', () => {
      component.setPassengerSeat(0, '3');
      expect(component.showSeatPreferenceFields(0, false, false, false)).toBeFalse();
    });

    it('one-way, OPEN -> HIDDEN regardless of seat state (allLegsOpenSeating parity)', () => {
      expect(component.showSeatPreferenceFields(0, true, false, false)).toBeFalse();
    });

    it('one-way ignores passengerSeatReturn: return seat set but outbound not -> still SHOWN', () => {
      component.setPassengerSeatReturn(0, '9');
      expect(component.showSeatPreferenceFields(0, false, false, false)).toBeTrue();
    });

    it('round trip, both legs ASSIGNED, neither seat picked -> SHOWN', () => {
      expect(component.showSeatPreferenceFields(0, false, false, true)).toBeTrue();
    });

    it('round trip, both legs ASSIGNED, only outbound seat picked -> SHOWN', () => {
      component.setPassengerSeat(0, '3');
      expect(component.showSeatPreferenceFields(0, false, false, true)).toBeTrue();
    });

    it('round trip, both legs ASSIGNED, only return seat picked -> SHOWN', () => {
      component.setPassengerSeatReturn(0, '3');
      expect(component.showSeatPreferenceFields(0, false, false, true)).toBeTrue();
    });

    it('round trip, both legs ASSIGNED, both seats picked -> HIDDEN', () => {
      component.setPassengerSeat(0, '3');
      component.setPassengerSeatReturn(0, '7');
      expect(component.showSeatPreferenceFields(0, false, false, true)).toBeFalse();
    });

    it('round trip, both legs OPEN -> HIDDEN', () => {
      expect(component.showSeatPreferenceFields(0, true, true, true)).toBeFalse();
    });

    it('mixed: outbound OPEN / return ASSIGNED, no return seat -> SHOWN (OPEN leg never required)', () => {
      expect(component.showSeatPreferenceFields(0, true, false, true)).toBeTrue();
    });

    it('mixed: outbound OPEN / return ASSIGNED, return seat picked -> HIDDEN', () => {
      component.setPassengerSeatReturn(0, '7');
      expect(component.showSeatPreferenceFields(0, true, false, true)).toBeFalse();
    });

    it('mixed: outbound ASSIGNED / return OPEN, no outbound seat -> SHOWN', () => {
      expect(component.showSeatPreferenceFields(0, false, true, true)).toBeTrue();
    });

    it('mixed: outbound ASSIGNED / return OPEN, outbound seat picked -> HIDDEN', () => {
      component.setPassengerSeat(0, '3');
      expect(component.showSeatPreferenceFields(0, false, true, true)).toBeFalse();
    });
  });
});

// OBRS-361 scrutinize blocker #1 — the live-sync subscription
// (`passengerData.valueChanges`, debounced 300ms) must settle to exactly one
// dispatch per burst of user edits, and a store-driven rebuild
// (`setPassengerData`, e.g. from the initial `invokeGetPassengerInfoSuccess`
// emission) must never itself trigger a dispatch — that's the feedback loop
// (sync -> dispatch -> store -> setPassengerData -> valueChanges -> sync ->
// ...) the `isPatchingFromStore` pre-debounce filter exists to break.
describe('PassengerInfoFormComponent — loop-safe live sync (OBRS-361 scrutinize blocker #1)', () => {
  let component: PassengerInfoFormComponent;
  let dispatchSpy: jasmine.Spy;

  beforeEach(() => {
    dispatchSpy = jasmine.createSpy('dispatch');
    const storeStub: any = {
      pipe: () => of(null),
      select: () => of(null),
      dispatch: dispatchSpy,
    };
    component = new PassengerInfoFormComponent(
      storeStub,
      createRouterStub(),
      new FormBuilder(),
      createTranslateStub(),
      createScheduleServiceStub()
    );
    component.ngOnInit();
    dispatchSpy.calls.reset(); // ignore ngOnInit's own invokeGetPassengerInfo() dispatch
  });

  it('typing settles to exactly ONE dispatch after the debounce window, not a dispatch storm', fakeAsync(() => {
    component.insertPassenger(true);
    tick(400); // flush any debounce triggered by inserting the row itself
    dispatchSpy.calls.reset();

    const firstName = component.passengerData.at(0).get('firstName')!;
    firstName.setValue('J');
    tick(50);
    firstName.setValue('Jo');
    tick(50);
    firstName.setValue('Joh');
    tick(50);
    firstName.setValue('John');

    tick(299); // still inside the 300ms debounce window since the last keystroke
    expect(dispatchSpy).not.toHaveBeenCalled();

    tick(1); // crosses the debounce boundary
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    tick(1000); // no further/extra dispatches after settling
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  }));

  it('a store-driven rebuild (setPassengerData) never triggers a dispatch — the pre-debounce guard blocks the loop', fakeAsync(() => {
    (component as any).setPassengerData([
      {
        isAdult: true,
        title: 1,
        firstName: 'Ann',
        middleName: '',
        lastName: 'Lee',
        phoneNumber: '',
        gender: 'FEMALE',
        isSelectSeat: true,
        passengerSeat: '',
        passengerSeatReturn: '',
        seatPreference: null,
        seatRequirement: null,
      },
    ]);

    tick(1000); // well past the debounce window
    expect(dispatchSpy).not.toHaveBeenCalled();
  }));
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
        SelectButtonModule,
      ],
      providers: [
        provideMockStore(),
        { provide: ScheduleService, useValue: createScheduleServiceStub() },
      ],
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

  // OBRS-361: both p-selectButton groups render with no pre-selection, and
  // (allowEmpty=true) re-clicking the already-selected option clears it back
  // to null — design-system §3.1's no-pre-seeded-default rule, applied to a
  // selectButton group instead of a dropdown.
  it('OBRS-361: seat preference/requirement selectButtons render unselected, and re-click clears to null', () => {
    render([assignedSchedule]); // ASSIGNED one-way, no seat yet -> fields shown

    expect(component.getFormValue(0, 'seatPreference')).toBeNull();
    expect(component.getFormValue(0, 'seatRequirement')).toBeNull();

    const prefGroup = fixture.debugElement.query(
      By.css('[aria-label="PASSENGER_INFO.FORM.SEAT_PREFERENCE_GROUP_ARIA"]')
    );
    expect(prefGroup).not.toBeNull();
    const prefButtons = prefGroup.queryAll(By.css('.p-togglebutton'));
    expect(prefButtons.length).toBe(2);
    expect(prefButtons.some((b) => b.nativeElement.classList.contains('p-togglebutton-checked'))).toBeFalse();

    prefButtons[0].nativeElement.click(); // select WINDOW
    fixture.detectChanges();
    expect(component.getFormValue(0, 'seatPreference')).toBe('WINDOW');
    expect(prefButtons[0].nativeElement.classList.contains('p-togglebutton-checked')).toBeTrue();

    prefButtons[0].nativeElement.click(); // re-click the SAME option clears it
    fixture.detectChanges();
    expect(component.getFormValue(0, 'seatPreference')).toBeNull();
    expect(prefButtons.some((b) => b.nativeElement.classList.contains('p-togglebutton-checked'))).toBeFalse();

    const reqGroup = fixture.debugElement.query(
      By.css('[aria-label="PASSENGER_INFO.FORM.SEAT_REQUIREMENT_GROUP_ARIA"]')
    );
    expect(reqGroup).not.toBeNull();
    const reqButtons = reqGroup.queryAll(By.css('.p-togglebutton'));
    expect(reqButtons.length).toBe(2);

    reqButtons[1].nativeElement.click(); // select EXTRA_LEGROOM
    fixture.detectChanges();
    expect(component.getFormValue(0, 'seatRequirement')).toBe('EXTRA_LEGROOM');

    reqButtons[1].nativeElement.click(); // re-click clears
    fixture.detectChanges();
    expect(component.getFormValue(0, 'seatRequirement')).toBeNull();
  });

  // QA-reported live defect (reproduced 3x, one-way ASSIGNED booking): a
  // passenger who set BOTH seatPreference AND seatRequirement had the
  // FIRST-clicked field silently drop to null in the actual submit payload,
  // even though both p-selectButtons still showed selected in the DOM. A
  // hand-built-object unit test on buildPassengersPayload() cannot see this
  // — the loss happens UPSTREAM, in the live form -> store -> form round
  // trip. This test drives the REAL form via two real DOM clicks with a
  // real debounced store round trip running in between (the exact QA repro
  // timing), using the real invokeSetPassengerInfo -> selectPassengerInfo
  // wiring (MockStore doesn't run reducers, so the fake dispatch below
  // manually completes the round trip exactly as
  // PassengerInfoEffect.setPassengerInfo$ does — a synchronous pass-through,
  // see passenger-info.effect.ts).
  it('OBRS-361 defect repro: setting BOTH fields survives the debounced store round-trip into the submit payload, all the way through the lowercase payload boundary', fakeAsync(() => {
    render([assignedSchedule]); // ASSIGNED one-way, 1 auto-seeded passenger

    // Fill the other required fields so validateAndGetPassengerInfo() below
    // can actually return a payload — irrelevant to the seatPreference/
    // seatRequirement defect itself, just satisfying this form's normal
    // required-field validators (title/firstName/lastName/gender), same as
    // a real traveler would before submitting.
    component.passengerData.at(0).patchValue({
      title: 1,
      firstName: 'Jane',
      lastName: 'Doe',
      gender: 'FEMALE',
    });
    fixture.detectChanges();

    const originalDispatch = store.dispatch.bind(store);
    // OBRS-915: NgRx 19 types Store#dispatch as an overload set carrying
    // CreatorsNotAllowedCheck, so a plain (action: any) => void no longer
    // satisfies it. Only the cast is new - the fake behaves exactly as before.
    spyOn(store, 'dispatch').and.callFake(((action: any) => {
      originalDispatch(action);
      if (action.type === invokeSetPassengerInfo.type) {
        store.overrideSelector(selectPassengerInfo, action.passengerInfo);
        store.refreshState();
      }
    }) as unknown as typeof store.dispatch);

    const prefGroup = fixture.debugElement.query(
      By.css('[aria-label="PASSENGER_INFO.FORM.SEAT_PREFERENCE_GROUP_ARIA"]')
    );
    const reqGroup = fixture.debugElement.query(
      By.css('[aria-label="PASSENGER_INFO.FORM.SEAT_REQUIREMENT_GROUP_ARIA"]')
    );
    const windowBtn = prefGroup.queryAll(By.css('.p-togglebutton'))[0];
    const wheelchairBtn = reqGroup.queryAll(By.css('.p-togglebutton'))[0];

    // Click 1: Window. Let the debounced live-sync round trip run to
    // completion BEFORE the 2nd click — the exact timing QA reproduced
    // (a store round trip landing mid-interaction, between the two clicks).
    windowBtn.nativeElement.click();
    fixture.detectChanges();
    tick(300);
    fixture.detectChanges();

    // Click 2: Wheelchair, on whatever control is now live post-round-trip.
    wheelchairBtn.nativeElement.click();
    fixture.detectChanges();
    tick(300);
    fixture.detectChanges();

    // Exactly 1 passenger card -> exactly 2 selectButton groups (preference
    // + requirement), never a duplicate-render artifact.
    expect(fixture.debugElement.queryAll(By.css('.p-selectbutton')).length)
      .withContext('one passenger card = exactly 2 selectButton groups (preference + requirement)')
      .toBe(2);

    expect(component.getFormValue(0, 'seatPreference')).toBe('WINDOW');
    expect(component.getFormValue(0, 'seatRequirement')).toBe('WHEELCHAIR');

    const submitted = component.validateAndGetPassengerInfo();
    expect(submitted?.[0].seatPreference).toBe('WINDOW');
    expect(submitted?.[0].seatRequirement).toBe('WHEELCHAIR');

    // End-to-end through the REAL payload mapper (the lowercase boundary) —
    // proves the fix all the way to what actually reaches POST /bookings.
    const bookingComponent = new PassengerInfoComponent(
      createStoreStub(),
      createRouterStub(),
      {} as any,
      createTranslateStub(),
      {} as any,
      createAnalyticsServiceStub()
    );
    const payload = (bookingComponent as any).buildPassengersPayload(submitted, 'outbound', false);
    expect(payload[0].seatPreference).toBe('window');
    expect(payload[0].seatRequirement).toBe('wheelchair');
  }));

  // OBRS-367 (follow-up from OBRS-361/362): count-delta prefs survival. The
  // OBRS-361 defect fix made `setPassengerData()` patch in place ONLY when the
  // passenger COUNT is unchanged; a count change still takes the remove/add
  // branch, which had no dedicated lock on the two new fields. The only screen
  // where the +/- count card AND the preference/requirement fields are both
  // live is a MIXED round trip (OPEN outbound => count card; ASSIGNED return,
  // no return seat => preference fields shown — see showSeatPreferenceFields).
  // This drives that real path: set both prefs on passenger 1, add passenger 2
  // via the OPEN leg's "+" (the real insertPassenger() + syncPassengerInfoToStore()
  // => store round trip => setPassengerData([p1, p2]) delta branch), and assert
  // passenger 1's prefs SURVIVE and passenger 2's are independent.
  it('OBRS-367: a passenger\'s seatPreference/seatRequirement survive adding a passenger, and the new passenger is independent', fakeAsync(() => {
    render([openSchedule, assignedSchedule]); // mixed: OPEN outbound + ASSIGNED return

    // MockStore runs no reducers, so mirror PassengerInfoEffect.setPassengerInfo$
    // (a synchronous pass-through) — feed each dispatched payload straight back
    // into selectPassengerInfo, exactly as the OBRS-361 defect-repro test above.
    const originalDispatch = store.dispatch.bind(store);
    // OBRS-915: NgRx 19 types Store#dispatch as an overload set carrying
    // CreatorsNotAllowedCheck, so a plain (action: any) => void no longer
    // satisfies it. Only the cast is new - the fake behaves exactly as before.
    spyOn(store, 'dispatch').and.callFake(((action: any) => {
      originalDispatch(action);
      if (action.type === invokeSetPassengerInfo.type) {
        store.overrideSelector(selectPassengerInfo, action.passengerInfo);
        store.refreshState();
      }
    }) as unknown as typeof store.dispatch);

    // Seeded with 1 adult from the schedule filter.
    expect(component.passengerData.length).toBe(1);

    // Set BOTH preference fields on passenger 1 via real DOM clicks, then let the
    // debounced live-sync round trip land (persisting them to the store).
    const p1Pref = fixture.debugElement.queryAll(
      By.css('[aria-label="PASSENGER_INFO.FORM.SEAT_PREFERENCE_GROUP_ARIA"]')
    )[0];
    const p1Req = fixture.debugElement.queryAll(
      By.css('[aria-label="PASSENGER_INFO.FORM.SEAT_REQUIREMENT_GROUP_ARIA"]')
    )[0];
    p1Pref.queryAll(By.css('.p-togglebutton'))[0].nativeElement.click(); // WINDOW
    p1Req.queryAll(By.css('.p-togglebutton'))[0].nativeElement.click(); // WHEELCHAIR
    fixture.detectChanges();
    tick(300);
    fixture.detectChanges();

    expect(component.getFormValue(0, 'seatPreference')).toBe('WINDOW');
    expect(component.getFormValue(0, 'seatRequirement')).toBe('WHEELCHAIR');

    // Add passenger 2 via the OPEN leg's "+": insertPassenger() +
    // syncPassengerInfoToStore() => a store round trip => setPassengerData([p1, p2])
    // taking the count-CHANGED (remove/add-delta) branch.
    const addBtn = fixture.debugElement.query(By.css('.passenger-add'));
    addBtn.nativeElement.click();
    fixture.detectChanges();
    tick(300);
    fixture.detectChanges();

    expect(component.passengerData.length).toBe(2);
    // Passenger 1's prefs SURVIVE the count change.
    expect(component.getFormValue(0, 'seatPreference')).toBe('WINDOW');
    expect(component.getFormValue(0, 'seatRequirement')).toBe('WHEELCHAIR');
    // Passenger 2 starts with NO inherited prefs.
    expect(component.getFormValue(1, 'seatPreference')).toBeNull();
    expect(component.getFormValue(1, 'seatRequirement')).toBeNull();

    // Passenger 2's prefs are independent — setting p2 never disturbs p1.
    const p2Pref = fixture.debugElement.queryAll(
      By.css('[aria-label="PASSENGER_INFO.FORM.SEAT_PREFERENCE_GROUP_ARIA"]')
    )[1];
    p2Pref.queryAll(By.css('.p-togglebutton'))[1].nativeElement.click(); // AISLE
    fixture.detectChanges();
    tick(300);
    fixture.detectChanges();

    expect(component.getFormValue(1, 'seatPreference')).toBe('AISLE');
    expect(component.getFormValue(0, 'seatPreference')).toBe('WINDOW'); // p1 untouched
  }));
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
        { provide: ScheduleService, useValue: createScheduleServiceStub() },
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
