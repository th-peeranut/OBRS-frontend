import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { DropdownGroupObrsComponent } from '../../../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
import { StationSwapButtonComponent } from '../../../../shared/components/station-swap-button/station-swap-button.component';
import { ParcelTripFormComponent } from './parcel-trip-form.component';
import { StationApi } from '../../../../shared/interfaces/station.interface';

describe('ParcelTripFormComponent', () => {
  let component: ParcelTripFormComponent;
  let fixture: ComponentFixture<ParcelTripFormComponent>;

  const stationA: StationApi = {
    id: 1,
    slug: 'a',
    status: 'operational',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
  };
  const stationB: StationApi = {
    id: 2,
    slug: 'b',
    status: 'operational',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
  };
  const stationC: StationApi = {
    id: 3,
    slug: 'c',
    status: 'operational',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
      ],
      declarations: [ParcelTripFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ParcelTripFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('cannot go next until from/to/date/schedule are all filled', () => {
    expect((component as any).canGoNext).toBeFalse();
  });

  it('emits next() with the resolved trip value once the form is valid', () => {
    const emitted: unknown[] = [];
    component.next.subscribe((v) => emitted.push(v));

    component['form'].setValue({
      fromStationId: stationA.id,
      toStationId: stationB.id,
      date: new Date('2026-08-01'),
      scheduleId: 42,
    });

    (component as any).onNext();

    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual({
      fromStationId: 1,
      toStationId: 2,
      date: new Date('2026-08-01'),
      scheduleId: 42,
    });
  });

  it('does not emit next() and flags stationsSame when from === to', () => {
    const emitted: unknown[] = [];
    component.next.subscribe((v) => emitted.push(v));

    component['form'].setValue({
      fromStationId: stationA.id,
      toStationId: stationA.id,
      date: new Date('2026-08-01'),
      scheduleId: 42,
    });

    (component as any).onNext();

    expect(emitted.length).toBe(0);
    expect((component as any).stationsSame).toBeTrue();
  });

  it('emits fromStationChange/toStationChange when a station is picked', () => {
    const from: number[] = [];
    const to: number[] = [];
    component.fromStationChange.subscribe((v) => from.push(v));
    component.toStationChange.subscribe((v) => to.push(v));

    (component as any).onFromStationSelect(stationA);
    (component as any).onToStationSelect(stationB);

    expect(from).toEqual([1]);
    expect(to).toEqual([2]);
  });

  // OBRS-1063. Deliberately NOT asserting that the dropdown shows its
  // placeholder: it already did that before the fix (the dropdown cannot find
  // the old id among the new options and falls back on its own), which is
  // exactly what made the bug easy to miss. What used to disagree with the
  // screen is the FormControl and the Next button, so those are what is
  // asserted here -- each case is red against the code before this change.
  describe('changing the route or the date clears the schedule (OBRS-1063)', () => {
    function nextButton(): HTMLButtonElement {
      return (fixture.nativeElement as HTMLElement).querySelector(
        '.parcel-btn-primary'
      ) as HTMLButtonElement;
    }

    function pickWholeTrip(): void {
      (component as any).onFromStationSelect(stationA);
      (component as any).onToStationSelect(stationB);
      (component as any).onScheduleSelect({ id: 42, label: '08:00' });
      fixture.detectChanges();
    }

    function expectCleared(): void {
      expect(component['form'].get('scheduleId')?.value)
        .withContext('the id from the previous route/date must not survive')
        .toBe('');
      expect((component as any).canGoNext).toBeFalse();
      expect(nextButton().disabled).toBeTrue();
    }

    beforeEach(() => {
      pickWholeTrip();
      // The premise: everything below starts from a form that IS submittable.
      expect(component['form'].get('scheduleId')?.value).toBe(42);
      expect(nextButton().disabled).toBeFalse();
    });

    it('AC#1/#2: changing the origin clears it and disables Next', () => {
      (component as any).onFromStationSelect(stationC);
      fixture.detectChanges();

      expectCleared();
    });

    it('AC#1/#2: changing the destination clears it and disables Next', () => {
      (component as any).onToStationSelect(stationC);
      fixture.detectChanges();

      expectCleared();
    });

    // The dangerous one: `ParcelOnlineReqDto` carries no date, so a stale
    // scheduleId from another day is a perfectly valid payload to the backend
    // -- nothing downstream would have caught this one.
    it('AC#5: changing the date clears it, and Next cannot submit the old round', () => {
      const emitted: unknown[] = [];
      component.next.subscribe((v) => emitted.push(v));

      component['form'].get('date')?.setValue(new Date('2026-09-01'));
      fixture.detectChanges();

      expectCleared();

      (component as any).onNext();
      expect(emitted).toEqual([]);
    });

    // OBRS-1035's swap is one more route change, and it patches with
    // `{ emitEvent: false }`, so it has to clear the schedule itself.
    it('AC#1: swapping origin/destination clears it too', () => {
      (
        fixture.debugElement.query(By.css('app-station-swap-button button'))
          .nativeElement as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      expectCleared();
    });

    // AC#3: the new route has no rounds at all, so no dropdown is even drawn
    // -- "no schedules found" and an enabled Next used to sit on screen together.
    it('AC#3: Next stays disabled when the new route has no schedules', () => {
      (component as any).onFromStationSelect(stationC);
      component.noSchedulesFound = true;
      fixture.detectChanges();

      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll('app-dropdown-group-obrs').length
      )
        .withContext('no schedule dropdown is drawn -- only the two station pickers')
        .toBe(2);
      expectCleared();
    });
  });

  // OBRS-1035 -- the third copy of the dead swap icon.
  describe('origin/destination swap (OBRS-1035)', () => {
    function swapButton(): HTMLButtonElement | null {
      const de = fixture.debugElement.query(By.css('app-station-swap-button button'));
      return de ? (de.nativeElement as HTMLButtonElement) : null;
    }

    it('renders a real <button> with a translated accessible name', () => {
      const button = swapButton();

      expect(button).not.toBeNull();
      expect(button!.getAttribute('type')).toBe('button');
      expect(button!.getAttribute('aria-label')).toBe('COMMON.SWAP_STATIONS');
    });

    it('AC#2: clicking swaps fromStationId and toStationId', () => {
      (component as any).onFromStationSelect(stationA);
      (component as any).onToStationSelect(stationB);
      fixture.detectChanges();

      swapButton()!.click();
      fixture.detectChanges();

      expect(component['form'].get('fromStationId')?.value).toBe(stationB.id);
      expect(component['form'].get('toStationId')?.value).toBe(stationA.id);
    });

    it('emits ONE stationsSwap carrying the final pair, and no per-field change', () => {
      (component as any).onFromStationSelect(stationA);
      (component as any).onToStationSelect(stationB);
      fixture.detectChanges();

      const swaps: unknown[] = [];
      const perField: unknown[] = [];
      component.stationsSwap.subscribe((v) => swaps.push(v));
      component.fromStationChange.subscribe((v) => perField.push(v));
      component.toStationChange.subscribe((v) => perField.push(v));

      swapButton()!.click();
      fixture.detectChanges();

      expect(swaps).toEqual([{ fromStationId: stationB.id, toStationId: stationA.id }]);
      // The per-field outputs would hand the page a half-swapped (B, B) pair,
      // whose schedule lookup can resolve AFTER the real one and overwrite it.
      expect(perField).toEqual([]);
    });

    it('AC#7 must-NOT: disabled while both fields are empty', () => {
      expect((component as any).canSwapStations).toBeFalse();
      expect(swapButton()!.disabled).toBeTrue();
    });

    it('one side filled still swaps, and reports the empty side as null', () => {
      (component as any).onFromStationSelect(stationA);
      fixture.detectChanges();

      const swaps: any[] = [];
      component.stationsSwap.subscribe((v) => swaps.push(v));

      expect(swapButton()!.disabled).toBeFalse();
      swapButton()!.click();
      fixture.detectChanges();

      expect(component['form'].get('fromStationId')?.value).toBe('');
      expect(component['form'].get('toStationId')?.value).toBe(stationA.id);
      expect(swaps).toEqual([{ fromStationId: null, toStationId: stationA.id }]);
    });

    // This is the screen the misalignment was REPORTED on, and the only one of
    // the three an e2e test cannot reach — `/parcel-booking` is gated off by
    // `features.onlineParcelBooking` in every built configuration (OBRS-622).
    // Its icon is 24px rather than 32px, so it also proves the offset tracks
    // `--station-swap-icon-size` instead of being one hard-coded number.
    // OBRS-1038 rewrote all three twins the same way — see home-booking's copy
    // for why branching on the viewport is not optional. On THIS screen the
    // branch matters most: no e2e lane can reach `/parcel-booking`, so whichever
    // branch Karma takes is the only automated proof this bar has.
    it('centres on the join between the two fields, level with the fields themselves', () => {
      const root = fixture.nativeElement as HTMLElement;
      root.style.display = 'block';
      root.style.width = '1200px';
      fixture.detectChanges();

      const host = fixture.debugElement.query(By.css('app-station-swap-button'))
        .nativeElement as HTMLElement;
      const fields = Array.from(
        root.querySelectorAll('app-dropdown-group-obrs .dropdown-btn')
      ).slice(0, 2) as HTMLElement[];
      expect(fields.length).toBe(2);

      const box = (el: HTMLElement) => el.getBoundingClientRect();
      const centreX = (el: HTMLElement) => box(el).left + box(el).width / 2;
      const centreY = (el: HTMLElement) => box(el).top + box(el).height / 2;

      if (window.matchMedia('(max-width: 992px)').matches) {
        // AC#4 of OBRS-1189: there IS a seam here now. While the labels sat ABOVE
        // their fields the lower one's label filled the gap between the two boxes
        // (measured 2026-08-05: its midpoint 15px below the upper field, inside
        // that label's own text row), so the button could only straddle the upper
        // field's bottom edge. The boxes TOUCH now -- they overlap by the 1px that
        // collapses their two borders into one line -- and that is the assertion
        // this card added: it is red against every build before it, which is what
        // makes it a proof of AC#4 rather than a restatement of the old layout.
        // It still hangs at the right end, where the reference sites put it.
        expect(box(fields[0]).left).toBe(box(fields[1]).left);
        expect(Math.abs(box(fields[1]).top - box(fields[0]).bottom)).toBeLessThanOrEqual(1);

        expect(Math.abs(centreY(host) - box(fields[0]).bottom)).toBeLessThanOrEqual(1);
        expect(centreX(host)).toBeGreaterThan(centreX(fields[0]));
        expect(box(host).right).toBeLessThanOrEqual(box(fields[0]).right);
      } else {
        expect(box(fields[0]).top).toBe(box(fields[1]).top);
        const seamX = (box(fields[0]).right + box(fields[1]).left) / 2;

        expect(Math.abs(centreX(host) - seamX)).toBeLessThanOrEqual(1);
        for (const field of fields) {
          expect(Math.abs(centreY(host) - centreY(field))).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  // OBRS-1189 follow-up, owner-approved after the card's own ACs shipped: the
  // ACs named the search BAR only, which left this card changing convention
  // halfway down its own screen -- a joined bar with the labels inside the
  // frames, then two fields still wearing theirs above the box. All three
  // assertions below are red against every build before this change.
  describe("the wizard's own two fields (OBRS-1189 follow-up)", () => {
    it('puts the date label inside the frame and keeps it bound to the input', () => {
      const root = fixture.nativeElement as HTMLElement;

      const group = root.querySelector(
        '.form-group-obrs.has-inline-label'
      ) as HTMLElement | null;
      expect(group)
        .withContext('the date group carries has-inline-label')
        .not.toBeNull();

      const label = group!.querySelector(
        'label.field-inline-label'
      ) as HTMLLabelElement | null;
      expect(label).not.toBeNull();

      // The binding, not just the markup: `inputId` is what puts the id on
      // PrimeNG's input, and `for` has to name that same id or the label is
      // decoration.
      const input = group!.querySelector('input') as HTMLInputElement;
      expect(input.id).toBe('parcelTripDate');
      expect(label!.getAttribute('for')).toBe(input.id);

      const picker = group!.querySelector('.p-datepicker') as HTMLElement;
      expect(picker.classList.contains('app-date-field--segment')).toBeTrue();
    });

    it('moves the schedule label inside the dropdown frame when there is a frame', () => {
      component.scheduleOptions = [{ id: 7, label: '08:00' }];
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const dropdowns = Array.from(
        root.querySelectorAll('app-dropdown-group-obrs')
      ) as HTMLElement[];
      const schedule = dropdowns[dropdowns.length - 1];

      const label = schedule.querySelector(
        '.combo-label-slot label.field-inline-label'
      ) as HTMLLabelElement | null;
      expect(label).not.toBeNull();
      expect(label!.textContent!.trim()).toBe('PARCEL_BOOKING.TRIP.SCHEDULE');

      const trigger = schedule.querySelector('.dropdown-btn') as HTMLElement;
      expect(label!.getAttribute('for')).toBe(trigger.id);

      // And no second copy left standing above the box.
      const groups = Array.from(
        root.querySelectorAll('.form-group-obrs')
      ) as HTMLElement[];
      const scheduleGroup = groups.find((g) =>
        g.contains(schedule)
      ) as HTMLElement;
      expect(
        scheduleGroup.querySelector(':scope > label')
      ).toBeNull();
    });

    it('keeps a heading above the schedule slot while it is loading or empty', () => {
      const root = fixture.nativeElement as HTMLElement;

      for (const state of [
        { isLoadingSchedules: true, noSchedulesFound: false },
        { isLoadingSchedules: false, noSchedulesFound: true },
      ]) {
        component.isLoadingSchedules = state.isLoadingSchedules;
        component.noSchedulesFound = state.noSchedulesFound;
        fixture.detectChanges();

        // Neither branch draws a field, so there is no frame to put the label
        // inside; without the heading these two states say "loading" and "not
        // found" about nothing.
        const headings = Array.from(root.querySelectorAll('label')).filter(
          (l) =>
            l.textContent!.trim() === 'PARCEL_BOOKING.TRIP.SCHEDULE' &&
            !l.classList.contains('field-inline-label')
        );
        expect(headings.length)
          .withContext(JSON.stringify(state))
          .toBe(1);
      }
    });
  });

});
