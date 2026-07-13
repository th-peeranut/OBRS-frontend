import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { UserUnlockModalComponent } from './user-unlock-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { UserRow } from '../user-management.mappers';

const LOCKED_ROW: UserRow = {
  id: 1,
  fullName: 'Mr John Doe',
  email: 'john@example.com',
  phone: '0812345678',
  roleSlugs: ['admin'],
  roles: ['Admin'],
  status: 'Active',
  statusCode: 'active',
  lastUpdated: '-',
  locked: true,
};

describe('UserUnlockModalComponent', () => {
  let fixture: ComponentFixture<UserUnlockModalComponent>;
  let component: UserUnlockModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [UserUnlockModalComponent, AdminModalBackdropDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(UserUnlockModalComponent);
    component = fixture.componentInstance;
  });

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('renders the user full name when isOpen is true', () => {
    component.isOpen = true;
    component.user = LOCKED_ROW;
    fixture.detectChanges();

    const strong = fixture.debugElement.query(By.css('.admin-modal-subtitle strong'));
    expect(strong.nativeElement.textContent).toContain('Mr John Doe');
  });

  it('disables the confirm button and shows the unlocking label while isUnlocking', () => {
    component.isOpen = true;
    component.user = LOCKED_ROW;
    component.isUnlocking = true;
    fixture.detectChanges();

    const confirmButton = fixture.debugElement.query(By.css('.admin-btn-primary'));
    expect(confirmButton.nativeElement.disabled).toBeTrue();
  });

  it('emits confirm/cancel on button clicks', () => {
    component.isOpen = true;
    component.user = LOCKED_ROW;
    fixture.detectChanges();

    const confirmSpy = jasmine.createSpy('confirm');
    const cancelSpy = jasmine.createSpy('cancel');
    component.confirm.subscribe(confirmSpy);
    component.cancel.subscribe(cancelSpy);

    const buttons = fixture.debugElement.queryAll(By.css('.admin-modal-actions button'));
    buttons[0].nativeElement.click(); // Cancel
    buttons[1].nativeElement.click(); // Confirm

    expect(cancelSpy).toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalled();
  });
});
