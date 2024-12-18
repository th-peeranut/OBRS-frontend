import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DropdownObrsComponent } from './dropdown-obrs.component';

describe('DropdownObrsComponent', () => {
  let component: DropdownObrsComponent;
  let fixture: ComponentFixture<DropdownObrsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DropdownObrsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DropdownObrsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
