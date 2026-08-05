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
  });

});
