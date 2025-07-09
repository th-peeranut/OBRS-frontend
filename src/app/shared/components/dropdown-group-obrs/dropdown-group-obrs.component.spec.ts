import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DropdownGroupObrsComponent } from './dropdown-group-obrs.component';

describe('DropdownGroupObrsComponent', () => {
  let component: DropdownGroupObrsComponent;
  let fixture: ComponentFixture<DropdownGroupObrsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DropdownGroupObrsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DropdownGroupObrsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
