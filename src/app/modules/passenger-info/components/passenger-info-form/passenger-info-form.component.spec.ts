import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { PassengerInfoFormComponent } from './passenger-info-form.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { PassengerSeatModule } from '../../passenger-seat.module';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
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
