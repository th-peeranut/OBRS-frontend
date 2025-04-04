import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScheduleBookingFilterComponent } from './schedule-booking-filter.component';

describe('ScheduleBookingFilterComponent', () => {
  let component: ScheduleBookingFilterComponent;
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
