import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PassengerSeatBoxComponent } from './passenger-seat-box.component';

describe('PassengerSeatBoxComponent', () => {
  let component: PassengerSeatBoxComponent;
  let fixture: ComponentFixture<PassengerSeatBoxComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PassengerSeatBoxComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PassengerSeatBoxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
