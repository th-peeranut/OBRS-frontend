import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DropdownObrsPassengerComponent } from './dropdown-obrs-passenger.component';

describe('DropdownObrsPassengerComponent', () => {
  let component: DropdownObrsPassengerComponent;
  let fixture: ComponentFixture<DropdownObrsPassengerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DropdownObrsPassengerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DropdownObrsPassengerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
