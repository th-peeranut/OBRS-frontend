import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PassengerSeatVanComponent } from './passenger-seat-van.component';

describe('PassengerSeatVanComponent', () => {
  let component: PassengerSeatVanComponent;
  let fixture: ComponentFixture<PassengerSeatVanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PassengerSeatVanComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PassengerSeatVanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
