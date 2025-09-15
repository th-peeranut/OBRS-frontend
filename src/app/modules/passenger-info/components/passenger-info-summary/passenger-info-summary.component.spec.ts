import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PassengerInfoSummaryComponent } from './passenger-info-summary.component';

describe('PassengerInfoSummaryComponent', () => {
  let component: PassengerInfoSummaryComponent;
  let fixture: ComponentFixture<PassengerInfoSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PassengerInfoSummaryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PassengerInfoSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
