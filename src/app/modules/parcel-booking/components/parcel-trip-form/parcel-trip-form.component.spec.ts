import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CalendarModule } from 'primeng/calendar';
import { DropdownGroupObrsComponent } from '../../../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
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
      imports: [ReactiveFormsModule, TranslateModule.forRoot(), CalendarModule, DropdownGroupObrsComponent],
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
});
