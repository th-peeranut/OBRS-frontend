import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PassengerInfoFormComponent } from './passenger-info-form.component';

describe('PassengerInfoFormComponent', () => {
  let component: PassengerInfoFormComponent;
  let fixture: ComponentFixture<PassengerInfoFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PassengerInfoFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PassengerInfoFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
