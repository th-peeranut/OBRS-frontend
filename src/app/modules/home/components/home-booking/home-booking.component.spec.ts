import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeBookingComponent } from './home-booking.component';

describe('HomeBookingComponent', () => {
  let component: HomeBookingComponent;
  let fixture: ComponentFixture<HomeBookingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomeBookingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeBookingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
