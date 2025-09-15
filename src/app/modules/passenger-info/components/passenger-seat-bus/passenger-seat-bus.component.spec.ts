import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PassengerSeatBusComponent } from './passenger-seat-bus.component';

describe('PassengerSeatBusComponent', () => {
  let component: PassengerSeatBusComponent;
  let fixture: ComponentFixture<PassengerSeatBusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PassengerSeatBusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PassengerSeatBusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
